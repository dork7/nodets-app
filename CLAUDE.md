# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It covers commands and the architecture overview; `AGENTS.md` covers where things live, the code patterns new backend/EJS code must follow, testing rules, and the pre-commit checklist.

## Commands

- `npm run dev` — start the dev server (`tsx watch` + `pino-pretty`), watches `src/`. Serves HTTP on `env.PORT` and the WebSocket server on the same HTTP server.
- `npm run build` — `rimraf dist && tsup` (bundles `src/**/*.ts`, copies `src/public` EJS views into `dist/public`).
- `npm start` — `node dist/index.js` (run after `build`).
- `npm run lint` / `npm run lint:fix` — ESLint (rules in `.eslintrc.json`; `simple-import-sort` is enforced). The scripts are a bare `eslint` with no path, so pass files explicitly: `npx eslint <changed files>`.
- `npm run format` — Prettier over the whole repo.
- `npm test` — `vitest run` (all tests, single pass).
- `npm run test:dev` — `vitest dev` (watch mode).
- `npm run test:cover` — `vitest run --coverage`.
- Single test file: `npx vitest run path/to/file.test.ts`. Single test by name: `npx vitest run -t "test name"`.
- Commits must follow Conventional Commits (`commitlint.config.ts`, enforced by a `commit-msg` Husky hook); `pre-commit`/`pre-push` hooks also run.
- Path alias `@/*` → `src/*` (declared in `tsconfig.json` and mirrored for tests via `vite-tsconfig-paths` in `vite.config.mts`) — always import with `@/...`, not relative `../../` chains.

## Architecture

**Boot sequence** (`src/index.ts`): starts the Express `app` (`src/server.ts`) listening on `env.PORT`, then `loadHandlers()` (populates the WS method registry), then `loadAIProviders()` (registers AI provider clients), then `startWebSocketServer(server)` attaches a `ws.WebSocketServer` to the *same* HTTP server — there is one port for both REST and WebSocket traffic.

**HTTP API** (`src/api/index.ts`): each feature directory follows router → service → (repository/model). Services return a `ServiceResponse` (`src/common/models/serviceResponse.ts`) that `handleServiceResponse` (`src/common/utils/httpHandlers.ts`) turns into the HTTP response. Zod schemas drive both request validation (`validateRequest`) and OpenAPI docs — every router registers its paths on a shared `OpenAPIRegistry` consumed by `src/api-docs`. Server-rendered EJS pages live in `src/public/`: `GET /chatAI`, `GET /goals` and `GET /dashboard` are defined directly in `src/server.ts` (not under `/v1`), while the `monitor`, `nutrition` and `taskPlanner` views are rendered from inside their own `/v1` routers.

**WebSocket server** (`src/ws/server/index.ts`): a single `WebSocketServer` dispatches by URL path, not by message shape:
- `/ws/server` and `/ws/stream` — generic RPC dispatch through a name→handler registry (`src/ws/server/registry.ts` + `methods.ts`); handlers live in `src/ws/server/handlers/*` (e.g. `ping`, `getTime`, `stream`) and must be added to the static `handlerModules` list in `methods.ts` — no runtime directory scan, for the same bundling reason as the AI providers below.
- `/ws/chatAI` — bypasses that registry entirely and calls `chatbotHandler` (`src/ws/server/handlers/chatbot/index.ts`) directly. This is where the RAG-enabled chat, tool-calling loop, and streaming logic live.

**Chatbot handler layout** (`src/ws/server/handlers/chatbot/`): `index.ts` is only the orchestrator (abort/stop-stream tracking per session id, RAG gate, monitor logging in `finally`); message/chunk types are in `types.ts`; the logic is split into feature folders under `utils/`:
- `attachments/imageHandler.ts` — resolves uploaded image/file ids to data URLs / extracted text and attaches them to the last user message.
- `history/` — `chatHistory.ts` (Mongo load/save), `conversation.ts` (history building), `relationCheck.ts` (is this turn related to the previous one).
- `rag/` — `ragContext.ts` (`injectRagContext`) and `relevanceCheck.ts` (`isRagAnswerRelated`).
- `tools/toolCallingLoop.ts` — `runToolCallingLoop`, which drives `response/streamingResponse.ts` or `response/nonStreamingResponse.ts`.
- `usage/tokenUsage.ts`, `ws/messaging.ts` (send helpers, stream errors), `ws/request.ts` (stop-stream detection, `stream` param normalisation).

Put new chatbot logic in the matching feature folder rather than growing `index.ts`.

**Multi-provider AI layer** (`src/config/openaiConfig/`): `registry.ts` is a bare name→client `Map`. `loadAIProviders()` statically imports `providers/{localAI,openRouterAI,ollamaAI}.ts` (each just an `OpenAI` SDK client pointed at a different `baseURL`/key) and registers them — imports are static rather than a runtime directory scan because `tsup` bundles everything into one `dist/index.js`, so a `fs.readdirSync(__dirname)`-style scan would look in the wrong place at runtime. `openai` (from `openaiConfig/index.ts`) is a lazy `Proxy` resolving the `'localAI'` default provider so it stays valid after boot-time registration runs. `callAI(model, messages, { provider, ... })` is the one call path used by every feature (chatbot, goals, vision, laya, relation/relevance checks) — go through `callAI`/`openai`, don't instantiate an `OpenAI` client directly.

**Prompts** (`src/config/prompt.ts`): every LLM prompt/instruction string in the app is centralized here — chat RAG guardrail, RAG relevance check, conversation relation-check, vision default prompt, goals topic-suggestion, Laya ticket-triage questions. Add new prompt text there rather than inlining it in a service/handler.

**Two independent RAG/vector-store subsystems — do not conflate them:**
1. `/v1/rag/*` → `ragService` (`src/api/rag/ragService.ts`) → `loaders.ts` / `chunker.ts` / `extractText.ts` → embeddings (`config/openaiConfig/embeddings.ts`) → **ChromaDB** (`src/services/vectorStore.ts`), configured by `RAG_*` / `CHROMA_URL`. REST-only; nothing in the live chatbot calls it.
2. `/v1/llamaIndex/*` and the chatbot's `rag` flag → `llamaIndexService` (`src/api/llamaIndex/service.ts`) → a LlamaIndex `VectorStoreIndex` backed by **Qdrant** (`config/qdrantStore.ts`), configured by `QDRANT_*`. This is the pipeline actually wired into `/ws/chatAI`: `message.rag` → `injectRagContext()` (`ws/server/handlers/chatbot/utils/rag/ragContext.ts`) → `llamaIndexService.extract(query, env.RAG_TOP_K, userId)` → `isRagAnswerRelated()` relevance check (`utils/rag/relevanceCheck.ts`, fails open) → `buildRagGuardrailPrompt()` unshifted as a system message before the model call. The context goes into the outgoing `aiMessages` only, never `conversationHistory`, so it is not persisted to MongoDB and re-injected on later turns.

Qdrant retrieval is **scoped per user**: documents are indexed with a `userId` in their metadata and every `query`/`extract` call filters on it, so `userId` is a required argument throughout `llamaIndexService`. The chatbot rejects a `rag: true` message with no `userId` (`stream_error`) instead of searching unscoped — keep that filter on any new retrieval path.

Both pipelines share the same `extractText()` (`src/api/rag/extractText.ts`); its file-extension whitelist gates what either pipeline can ingest. Besides PDF, `.docx` and plain-text/code files, it OCRs raster images and PDFs via `tesseract.js` when `OCR_ENABLED` is set (languages from `OCR_LANGS`): pages with a text layer keep their text plus OCR of sizeable embedded images, and scanned pages are rendered whole and OCR'd. With OCR off, images are rejected as unsupported and PDFs use the text layer only.

**Persistence & optional infra:**
- MongoDB (`src/config/mongoose.ts`) connects unconditionally at boot and stores chat history (`models/chatHistory.model.ts`) plus AI call/usage logs (`models/aiCallLog.model.ts`, `models/aiModelStats.model.ts`, `src/services/monitorService.ts`), surfaced via `/v1/monitor` and `/dashboard`.
- Redis (`ENABLE_REDIS`) and MinIO (`ENABLE_MINIO`) are optional, and the init block in `src/server.ts` only runs when `ENV === 'local'` **and** `ENABLE_REDIS` is set — so MinIO is currently initialized only if Redis is enabled too. Redis backs response caching (`config/cacheConfig.ts`, `common/middleware/cacheHandler.ts`, rules in `cacheRules.ts`), MinIO backs object storage for file uploads.
- Kafka wiring exists (`config/kafka.ts`, `common/middleware/reqLoggerKafka.ts`) but its init call is commented out in `src/server.ts` — treat it as inactive unless re-enabled.
- File uploads have two parallel backends — `src/api/localStorage` (Mongo-tracked local disk) and `src/api/minio` — both feed the RAG ingestion paths and chatbot file attachments (`ws/server/handlers/chatbot/utils/attachments/imageHandler.ts`).
