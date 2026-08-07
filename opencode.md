# opencode.md

Guidance for AI agents working in this repository.

## Project Overview

Express + TypeScript backend (Express TypeScript Boilerplate 2024). A REST API, GraphQL endpoint, WebSocket server, and several AI/LLM integrations (LocalAI at `http://localhost:8080/v1`), object storage (MinIO), Redis, Mongo/Mongoose, and Kafka. No frontend app (the `client/` React workspace was removed); the only UI is the server-rendered `src/public/chatAI.ejs` chat window served at `/chatAI`.

## Tech Stack

- Runtime: Node LTS (`node v25`, `.nvmrc` = `lts/*`)
- Language: TypeScript (~5.x at root)
- HTTP framework: Express 4
- Validation: zod (+ `@zodyac/zod-mongoose`, `zod-to-openapi` for OpenAPI spec)
- Logging: pino (+ `pino-pretty` in dev)
- Storage: MinIO (S3-compatible), Redis, MongoDB (Mongoose)
- Messaging: Kafka (KafkaJS), STOMP
- WebSocket: `ws` (paths `/ws/chatAI`, `/ws/stream`, `/ws/server`)
- LLM: OpenAI SDK pointed at LocalAI (`baseURL: http://localhost:8080/v1`), Tesseract OCR
- AI container stack: `docker compose -f ai-docker-compose.yml up` (LocalAI :8080, ChromaDB :8000, Redis)
- Infra: `docker compose up` (Mongo, MinIO, Kafka, Zookeeper, Redis, mongo-express, kafka-ui)

## Common Commands

```bash
yarn install            # install deps
yarn dev                # server only, auto-reload on any src/ change (tsx watch)
yarn build              # rimraf dist && tsup
yarn start              # node dist/index.js
yarn lint               # eslint . (format via prettier)
yarn lint:fix           # eslint --fix
yarn format             # prettier --write .
yarn test               # vitest run
```

Notes:
- The server runs on port 2020 (see `.env` / `envConfig`).
- `tsx watch --watch-path=src` reloads on any change under `src/`.
- Pre-existing typecheck errors exist (deprecated `baseUrl`/`node10` tsconfig options, and errors in `server.ts`, `services/minio.ts`, `services/redisStore.ts`, `src/ws/server/index.ts` missing `@types/ws`, and kafka/orders/minio test/model files). Do not treat those as regressions; fix only what your change introduces. Run `yarn tsc --noEmit -p tsconfig.json --ignoreDeprecations "6.0"` to filter them if needed.

## Project Structure

```
src/
  api/            # feature routers/services (REST, mounted under /v1)
    aiUtils/      # chat history, token usage, loaded-models, unload-model (LocalAI)
    catalogue/    # catalogue CRUD
    graphql/      # graphql schema + resolvers
    healthCheck/  # /v1/health-check
    kafka/        # kafka producer/consumer demo
    minio/        # file upload/list/get/delete (Multer + MinIO)
    orders/       # orders CRUD
    redis/        # redis demo
    user/         # user CRUD
    vision/       # OCR (Tesseract)
  common/         # middleware, models (ServiceResponse), utils (env, fileUtils, slack, LocalAI/Docker LLM helpers)
  config/         # mongoose, kafka, cache, redisStore
  openai/         # OpenAI client + callAI (LocalAI), webSearch, isRelatedConversation
  public/         # server-rendered views (chatAI.ejs, dashboard.ejs)
  services/       # minio client + bucket init, redis store
  ws/server/   # WebSocket server + chatAI handler
  index.ts        # entry point (starts HTTP + WS)
  server.ts       # express app, middleware, routes, /chatModels, /chatAI
```

## Key Endpoints

- `GET  /v1/health-check`
- `POST /v1/minio/upload` — single file (field `file`, optional `bucket`). Returns `{ id, url, name }`.
- `POST /v1/minio/upload/multiple` — files (field `files`)
- `GET  /v1/minio/files` — list uploaded file references (from Mongo)
- `GET  /v1/minio/:id` — stream file from MinIO
- `DELETE /v1/minio/:id`
- `GET  /v1/aiUtils/chat-history/:userId`, `GET /v1/aiUtils/token-usage/:userId`
- `GET  /v1/aiUtils/loaded-models` — models loaded in RAM from LocalAI `GET /system`
- `POST /v1/aiUtils/unload-model` — body `{ "model": "name" }` → LocalAI `POST /backend/shutdown`
- `GET  /chatModels` — LLM models list from LocalAI `GET /v1/models` (falls back to `env.AI_MODELS`)
- `GET  /chatAI` — the chat UI (ejs)
- `GET  /graphql` — GraphiQL

All API responses use the `ServiceResponse` shape: `{ success, message, responseObject, statusCode }`.

## Chat / LLM Flow (chatAI)

1. Browser connects to `ws://localhost:2020/ws/chatAI`.
2. Sends `{ sender:'User', type:'request', id, method:'chatAI', stream, model, params:{ prompt, imageId? } }`.
3. `src/ws/server/handlers/chatAI.ts` resolves optional `imageId` to a base64 data URL via `getImageDataUrl()` (fetches from MinIO), builds OpenAI messages (image attached to last user message as `image_url`), and calls `callAI()` → LocalAI.
4. Streaming chunks are relayed back over WS (`stream_start` → `stream_continue` → `stream_end`).
5. Conversation history and token usage are persisted in Redis.

## File Upload (chatAI.ejs)

- `Upload` button + drag-and-drop onto the chat window.
- Only PDF, Word (doc/docx), and image files are accepted (validated by MIME/extension).
- Images are uploaded to MinIO, shown as a thumbnail in the chat, and the MinIO `id` is attached to the next send via `params.imageId`.
- MinIO buckets are set to public-read (`services/minio.ts` `publicReadPolicy`) and stored URLs include `http://` scheme.

## Conventions

- `ServiceResponse<T>` for all service return values; routers wrap with `handleServiceResponse`.
- Zod schemas for request validation (`validateRequest`) and OpenAPI registration.
- Path alias `@/` → `src/`.
- Formatting: Prettier + ESLint (`simple-import-sort`). Run `yarn format` and `yarn lint:fix` on touched files.
- Files in `src/` are formatted with single-space indent per Prettier config (`.prettierrc`); run `yarn prettier --config .prettierrc --write <file>` after editing `.ts` files to avoid lint noise.
- `chatAI.ejs` script is inline with `nonce="abc123"`; validate it with `node --check` after extraction.
- Commit style: Conventional Commits (see `commitlint.config.ts`).
