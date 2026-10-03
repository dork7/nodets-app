# AGENTS.md

Guide for AI coding agents working in this repo. Read `CLAUDE.md` for commands and the architecture overview; this file covers **where things live** and **the patterns new code must follow**.

## Project structure

```
src/
├── index.ts                 # boot: app.listen → loadHandlers → loadAIProviders → startWebSocketServer
├── server.ts                # Express app, middleware, EJS page routes (/chatAI, /goals, …), exports `app` + `logger`
├── api/                     # REST features, all mounted under /v1 in api/index.ts
│   ├── <feature>/           # one folder per feature (see "Backend feature layout")
│   ├── rag/                 # Chroma RAG pipeline + shared extractText.ts (PDF/DOCX/images/OCR)
│   └── llamaIndex/          # Qdrant RAG pipeline (used by the chatbot)
├── api-docs/                # OpenAPI generator + Swagger router (collects every feature's registry)
├── common/
│   ├── middleware/          # errorHandler, rateLimiter, requestLogger, cacheHandler, …
│   ├── models/              # ServiceResponse
│   └── utils/               # envConfig (envalid), httpHandlers, helpers, …
├── config/
│   ├── openaiConfig/        # provider registry + callAI (the only LLM call path)
│   ├── prompt.ts            # ALL LLM prompt strings
│   └── mongoose.ts, qdrantStore.ts, redisStore.ts, kafka.ts, …
├── models/                  # Mongoose models (*.model.ts)
├── services/                # cross-feature services (vectorStore, minio, monitorService, redisStore)
├── ws/server/               # WebSocket server; handlers/ (RPC) and handlers/chatbot/ (/ws/chatAI)
└── public/                  # server-rendered EJS pages (chatAI, goals, monitor, nutrition, taskPlanner, index)
```

## Backend code patterns

### Feature layout

New REST features go in `src/api/<feature>/`. Older features use prefixed names (`goalsRouter.ts`, `goalsService.ts`, `goalsModel.ts`, `goalsRepository.ts`); newer ones use short names (`router.ts`, `service.ts`, `model.ts`). Match the style of the folder you are in; prefer the short names for new folders.

| File            | Responsibility                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.ts`      | Zod schemas for request/response + inferred types. Call `extendZodWithOpenApi(z)`; name reusable schemas with `.openapi('Name')`.            |
| `router.ts`     | Express router + `OpenAPIRegistry`. Validates input, calls the service, returns via `handleServiceResponse`. No business logic.              |
| `service.ts`    | Exported object literal (`export const fooService = { … }`) of async methods returning `ServiceResponse<T \| null>`. Catches its own errors. |
| `repository.ts` | Optional data-access layer (Mongo/Redis) when the service would otherwise touch storage directly.                                            |

Register the router in `src/api/index.ts` (`router.use('/<feature>', fooRouter)`) and its registry in `src/api-docs/openAPIDocumentGenerator.ts`.

### Router

```ts
export const fooRegistry = new OpenAPIRegistry();

export const fooRouter: Router = (() => {
 const router = express.Router();

 fooRegistry.registerPath({
  method: 'get',
  path: '/foo',
  tags: ['Foo'],
  request: { query: FooQuerySchema.shape.query },
  responses: createApiResponse(FooResponseSchema, 'Success'),
 });

 router.get('/', validateRequest(FooQuerySchema), async (req: Request, res: Response) => {
  const serviceResponse = await fooService.find(String(req.query.q));
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
```

- Request schemas are shaped `z.object({ body?, query?, params? })` so `validateRequest` can check them.
- Document **every** param the handler reads in `registerPath` — keep docs and handler in sync.
- File uploads: `multer` memory storage with a size limit; map `MulterError` (`LIMIT_FILE_SIZE` → 413) to a `ServiceResponse`.

### Service

```ts
export const fooService = {
 find: async (q: string): Promise<ServiceResponse<Foo | null>> => {
  try {
   const data = await …;
   return new ServiceResponse(ResponseStatus.Success, 'Foo found', data, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Failed to find foo: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
```

- Never throw out of a service method; return a `Failed` `ServiceResponse` with the right `StatusCodes`.
- Use typed error classes (e.g. `NoExtractableTextError`, `UnsupportedFileTypeError`) for expected failures and map them to 4xx; unknown errors → 500.
- Expensive singletons (models, clients, indexes) are lazily created once and cached in a module-level promise; reset the promise on failure.

### Cross-cutting rules

- **Imports:** always `@/…` aliases, never `../../`. `simple-import-sort` is enforced (`npm run lint:fix`).
- **Formatting:** Prettier — 1-space indent, single quotes, semicolons, width 120, `es5` trailing commas.
- **Config:** new env vars go in `src/common/utils/envConfig.ts` (envalid, with `default` + `desc`) **and** `.env.template`. Read them via `env.X`, never `process.env`.
- **LLM calls:** go through `callAI` / `openai` from `@/config/openaiConfig`; never instantiate an `OpenAI` client.
- **Prompts:** every prompt string lives in `src/config/prompt.ts`.
- **Logging:** `import { logger } from '@/server'` — no `console.log` in server code.
- **Mongo models:** `src/models/<name>.model.ts` with a `<Name>Doc` interface + `new Schema<Doc>(…)` + `model(…)`.
- **RAG:** don't conflate the two pipelines (Chroma `/v1/rag` vs Qdrant `/v1/llamaIndex`). Text extraction for both is `src/api/rag/extractText.ts`.
- **WebSocket RPC handlers:** a module in `src/ws/server/handlers/` exporting `name` and `handler`, added to the static `handlerModules` list in `methods.ts` (no runtime directory scans — tsup bundles to one file).
- **Comments:** explain _why_ (constraints, gotchas), not what.

## Frontend code patterns (`src/public/*.ejs`)

Pages are single self-contained EJS files: inline `<style>` + inline `<script nonce="abc123">`, no build step, no framework. They're served by routes in `src/server.ts` via `res.render(...)`.

- **CSP:** inline scripts must carry `nonce="abc123"` (set in the `Content-Security-Policy` header in `server.ts`). No inline `onclick=` handlers — attach with `addEventListener`.
- **Theme:** use the CSS custom properties on `:root` (`--bg`, `--bg-raised`, `--fg`, `--fg-muted`, `--border`, `--accent`, `--success`/`--warn`/`--danger`/`--info`, `--radius`, `--font-mono`/`--font-sans`). Never hardcode colors. For design work, use the `design` skill.
- **Script structure** (see `chatAI.ejs`):
  - `CONFIG` — all URLs derived from `window.location.origin` (and `ws:`/`wss:` from the protocol). Never hardcode `localhost`.
  - `elements` — every DOM lookup, once, by id.
  - `state` — mutable page state (session id, socket, flags).
  - `utils` — helpers (`parseMarkdown`, formatting).
  - Feature functions grouped by section with `// ===== Section =====` headers.
- **API calls:** `fetch` against `CONFIG.*` URLs; check `res.ok` and read the `ServiceResponse` shape (`success`, `message`, `responseObject`); show `message` to the user on failure.
- **Untrusted text:** anything from the user, files, or the model must go through `escapeHtml` / `utils.parseMarkdown` before hitting `innerHTML`; prefer `textContent` for plain strings.
- **Chat:** real-time chat goes over `CONFIG.WS_URL` (`/ws/chatAI`); reconnect using `CONFIG.RECONNECT_DELAY`.

## Testing

- Vitest (`globals: true`, `restoreMocks: true`) + Supertest. Tests live next to code in `__tests__/` folders, named `<unit>.test.ts`.
- HTTP tests: `request(app)` from `@/server`, assert status code and the `ServiceResponse` body (see `src/api/healthCheck/__tests__/healthCheckRouter.test.ts`).
- Mock external infra (Mongo, Qdrant, Chroma, Redis, MinIO, LLM providers) with `vi.mock`; tests must not need live services or network.
- Run: `npm test`, one file: `npx vitest run <path>`, one test: `npx vitest run -t "<name>"`.
- The `tester` subagent (`.claude/agents/tester.md`) writes and runs tests following these rules.

## Subagents (`.claude/agents/`)

| Agent              | Use for                                    | Edits code? |
| ------------------ | ------------------------------------------ | ----------- |
| `architect`        | Design decisions, trade-offs, ADRs         | No          |
| `planner`          | Step-by-step implementation plans          | No          |
| `tester`           | Writing and running Vitest/Supertest tests | Tests only  |
| `code-reviewer`    | Reviewing diffs before commit/merge        | No          |
| `refactor-cleaner` | Dead code and duplicate cleanup            | Yes         |

## Before finishing a change

1. `npx eslint <changed files>` and `npx tsc --noEmit -p .` show no **new** errors in touched files. Note: `npm run lint` is currently a bare `eslint` and lints nothing; there are also pre-existing type errors elsewhere.
2. `npx vitest run` has no **new** failures (the suite already has pre-existing failures in `openAPIRouter`, `healthCheckRouter` and `requestLogger` tests); add or update tests for changed behavior.
3. Commit with Conventional Commits and a **lowercase** subject (`feat: ocr …`, not `feat: OCR …`) — commitlint rejects otherwise.
4. Stage only the files you changed; never commit `localStorage/`, `ragStorage/`, `*.traineddata`, or `.env`.
