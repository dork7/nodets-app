# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the dev server (`tsx watch` + `pino-pretty`), watches `src/`. Serves HTTP on `env.PORT` and the WebSocket server on the same HTTP server.
- `npm run build` — `rimraf dist && tsup` (bundles `src/**/*.ts`, copies `src/public` EJS views into `dist/public`).
- `npm start` — `node dist/index.js` (run after `build`).
- `npm run lint` / `npm run lint:fix` — ESLint (flat rules in `.eslintrc.json`; `simple-import-sort` is enforced).
- `npm run format` — Prettier over the whole repo.
- `npm test` — `vitest run` (all tests, single pass).
- `npm run test:dev` — `vitest dev` (watch mode).
- `npm run test:cover` — `vitest run --coverage`.
- Single test file: `npx vitest run path/to/file.test.ts`. Single test by name: `npx vitest run -t "test name"`.
- Commits must follow Conventional Commits (`commitlint.config.ts`, enforced by a `commit-msg` Husky hook); `pre-commit`/`pre-push` hooks also run.
- Path alias `@/*` → `src/*` (declared in `tsconfig.json` and mirrored for tests via `vite-tsconfig-paths` in `vite.config.mts`) — always import with `@/...`, not relative `../../` chains.

## Architecture

**Boot sequence** (`src/index.ts`): starts the Express `app` (`src/server.ts`) listening on `env.PORT`, then `loadHandlers()` (populates the WS method registry), then `loadAIProviders()` (registers AI provider clients), then `startWebSocketServer(server)` attaches a `ws.WebSocketServer` to the *same* HTTP server — there is one port for both REST and WebSocket traffic.

**HTTP API** (`src/api/index.ts`): each feature directory follows router → service → (repository/model). Services return a `ServiceResponse` (`src/common/models/serviceResponse.ts`) that `handleServiceResponse` (`src/common/utils/httpHandlers.ts`) turns into the HTTP response. Zod schemas drive both request validation (`validateRequest`) and OpenAPI docs — every router registers its paths on a shared `OpenAPIRegistry` consumed by `src/api-docs`. Two feature UIs are server-rendered EJS pages, not routed through `/v1`: `GET /chatAI` and `GET /goals` (views in `src/public/`).

**WebSocket server** (`src/ws/server/index.ts`): a single `WebSocketServer` dispatches by URL path, not by message shape:
- `/ws/server` and `/ws/stream` — generic RPC dispatch through a name→handler registry (`src/ws/server/registry.ts` + `methods.ts`); handlers live in `src/ws/server/handlers/*` (e.g. `ping`, `getTime`, `stream`).
- `/ws/chatAI` — bypasses that registry entirely and calls `chatbotHandler` (`src/ws/server/handlers/chatbot/index.ts`) directly. This is where the RAG-enabled chat, tool-calling loop, and streaming logic live.

**Multi-provider AI layer** (`src/config/openaiConfig/`): `registry.ts` is a bare name→client `Map`. `loadAIProviders()` statically imports `providers/{localAI,openRouterAI,ollamaAI}.ts` (each just an `OpenAI` SDK client pointed at a different `baseURL`/key) and registers them — imports are static rather than a runtime directory scan because `tsup` bundles everything into one `dist/index.js`, so a `fs.readdirSync(__dirname)`-style scan would look in the wrong place at runtime. `openai` (from `openaiConfig/index.ts`) is a lazy `Proxy` resolving the `'localAI'` default provider so it stays valid after boot-time registration runs. `callAI(model, messages, { provider, ... })` is the one call path used by every feature (chatbot, goals, vision, laya, relation/relevance checks) — go through `callAI`/`openai`, don't instantiate an `OpenAI` client directly.

**Prompts** (`src/config/prompt.ts`): every LLM prompt/instruction string in the app is centralized here — chat RAG guardrail, RAG relevance check, conversation relation-check, vision default prompt, goals topic-suggestion, Laya ticket-triage questions. Add new prompt text there rather than inlining it in a service/handler.

**Two independent RAG/vector-store subsystems — do not conflate them:**
1. `/v1/rag/*` → `ragService` (`src/api/rag/ragService.ts`) → `loaders.ts` / `chunker.ts` / `extractText.ts` → embeddings (`config/openaiConfig/embeddings.ts`) → **ChromaDB** (`src/services/vectorStore.ts`), configured by `RAG_*` / `CHROMA_URL`. REST-only; nothing in the live chatbot calls it.
2. `/v1/llamaIndex/*` and the chatbot's `rag` flag → `llamaIndexService` (`src/api/llamaIndex/service.ts`) → a LlamaIndex `VectorStoreIndex` backed by **Qdrant** (`config/qdrantStore.ts`), configured by `QDRANT_*`. This is the pipeline actually wired into `/ws/chatAI`: `message.rag` → `llamaIndexService.extract()` → `isRagAnswerRelated()` relevance check (`ws/server/handlers/chatbot/utils/ragUtils.ts`) → `buildRagGuardrailPrompt()` injected as a system message before the model call.

Both pipelines share the same `extractText()` (`src/api/rag/extractText.ts`); its file-extension whitelist gates what either pipeline can ingest.

**Persistence & optional infra:**
- MongoDB (`src/config/mongoose.ts`) connects unconditionally at boot and stores chat history (`models/chatHistory.model.ts`) plus AI call/usage logs (`models/aiCallLog.model.ts`, `models/aiModelStats.model.ts`, `src/services/monitorService.ts`), surfaced via `/v1/monitor` and `/dashboard`.
- Redis (`ENABLE_REDIS`) and MinIO (`ENABLE_MINIO`) are only initialized when their env flags are set (see `src/server.ts`); Redis backs response caching (`config/cacheConfig.ts`, `common/middleware/cacheHandler.ts`, rules in `cacheRules.ts`), MinIO backs object storage for file uploads.
- Kafka wiring exists (`config/kafka.ts`, `common/middleware/reqLoggerKafka.ts`) but its init call is commented out in `src/server.ts` — treat it as inactive unless re-enabled.
- File uploads have two parallel backends — `src/api/localStorage` (Mongo-tracked local disk) and `src/api/minio` — both feed the RAG ingestion paths and chatbot file attachments (`ws/server/handlers/chatbot/utils/imageHandler.ts`).
