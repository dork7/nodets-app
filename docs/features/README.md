# Feature documentation

One document per feature. Each covers what the feature does, where the code lives, its endpoints or protocol, how it works, its configuration and dependencies, and the **errors it can produce**, with their causes.

Everything here was written from reading the code on branch `rag-system` (2026-09-30). Where a behaviour looks like a bug, it is listed under **Known issues** in that feature's doc, with the file and line.

## Index

| Feature                                                                    | Doc                                        | Entry points                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| Platform: boot, config, middleware, error handling, health check, API docs | [platform.md](platform.md)                 | `src/index.ts`, `src/server.ts`, `/v1/health-check`, `/swagger.json` |
| AI providers and the LLM call path                                         | [ai-providers.md](ai-providers.md)         | `callAI`, `/v1/aiProviders`, `/chatModels`                           |
| Chatbot over WebSocket (RAG, attachments, tools, streaming)                | [chat-websocket.md](chat-websocket.md)     | `ws://…/ws/chatAI`, `GET /chatAI` page                               |
| Chat REST API                                                              | [chat-rest.md](chat-rest.md)               | `POST /v1/ai/chat`                                                   |
| WebSocket RPC (`ping`, `getTime`, `stream`, …)                             | [websocket-rpc.md](websocket-rpc.md)       | `ws://…/ws/server`, `ws://…/ws/stream`                               |
| RAG: LlamaIndex + Qdrant (used by chat)                                    | [rag-llamaindex.md](rag-llamaindex.md)     | `/v1/llamaIndex/*`                                                   |
| RAG: Chroma (REST only)                                                    | [rag-chroma.md](rag-chroma.md)             | `/v1/rag/*`                                                          |
| Text extraction and OCR (shared by both RAG pipelines and chat)            | [text-extraction.md](text-extraction.md)   | `extractText()`                                                      |
| File storage: local disk, fs-util wrapper, MinIO                           | [file-storage.md](file-storage.md)         | `/v1/localStorage/*`, `/v1/fs-util/*`, `/v1/minio/*`                 |
| AI utilities: chat history, token usage, model load/unload, TTS            | [ai-utils.md](ai-utils.md)                 | `/v1/aiUtils/*`                                                      |
| Monitoring dashboard and AI call logs                                      | [monitoring.md](monitoring.md)             | `/v1/monitor/*`                                                      |
| Vision (image analysis) and nutrition page                                 | [vision-nutrition.md](vision-nutrition.md) | `/v1/vision/analyze`, `/v1/nutrition`                                |
| Learning goals tracker                                                     | [goals.md](goals.md)                       | `/v1/goals/*`, `GET /goals` page                                     |
| Task planner and settings (tags, resources)                                | [task-planner.md](task-planner.md)         | `/v1/taskPlanner/*`, `/v1/settings/*`                                |
| Support-ticket triage (Laya)                                               | [laya.md](laya.md)                         | `POST /v1/laya/classify-ticket`                                      |
| Catalogue and response caching                                             | [catalogue-cache.md](catalogue-cache.md)   | `/v1/catalogue/*`, cache middleware                                  |
| Redis key/value API and Kafka                                              | [redis-kafka.md](redis-kafka.md)           | `/v1/redis/*`, `/v1/kafka/*`                                         |

`docs/RAG_GUIDE.md` is an older guide to the RAG setup. The two RAG docs above describe the current code.

## Shared error model

Almost every REST endpoint returns a `ServiceResponse` body (`src/common/models/serviceResponse.ts`):

```json
{ "success": false, "message": "…", "responseObject": null, "statusCode": 400 }
```

These errors can happen on **any** endpoint:

| Situation                                   | Status      | Body / behaviour                                                                                                      | Source                                                   |
| ------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Request fails its Zod schema                | 400         | `message: "Invalid input: <path> <reason>, …"`, e.g. `Invalid input: body,title Required`                             | `validateRequest`, `src/common/utils/httpHandlers.ts:18` |
| Unknown route                               | 404         | Plain `Not Found` text, **not** JSON                                                                                  | `errorHandler.ts:8` (`res.sendStatus(404)`)              |
| Malformed JSON body                         | 400         | `ServiceResponse` with the body-parser message                                                                        | `errorHandler.ts:22`                                     |
| Any other thrown error that reaches Express | 500         | `message: "Internal Server Error"`; outside production the error object is also included                              | `errorHandler.ts:22`                                     |
| Too many requests from one IP               | 429         | Text `Too many requests, please try again later.` The default is 2000 requests per 15 minutes, set by `.env.template` | `rateLimiter.ts`                                         |
| Any failed `ServiceResponse`                | as returned | The response gets a `noCache: true` header, and a Slack message is sent if `ENABLE_SLACK_LOGGING=true`                | `handleServiceResponse`, `httpHandlers.ts:9`             |

**Side effect of `logger.error`:** the logger in `src/server.ts:30` is wrapped so that every `logger.error` and `logger.fatal` call also sends a Slack notification (only when `ENABLE_SLACK_LOGGING=true`).

## External dependencies at a glance

| Dependency                        | Required?                                               | Used by                                                                |
| --------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| MongoDB (`MONGO_URI`)             | **Yes.** The process exits if it can't connect          | Chat history, AI call logs, local file records, task planner, settings |
| LocalAI (`LOCALAI_URL`)           | Default AI provider                                     | Chat, relation/relevance checks, TTS, model lists, monitoring          |
| OpenRouter (`OPENROUTER_API_KEY`) | For OpenRouter models and **all** LlamaIndex embeddings | Chat, vision, nutrition, Qdrant RAG                                    |
| Qdrant (`QDRANT_URL`)             | For chat RAG                                            | `/v1/llamaIndex/*`, `/ws/chatAI` with `rag: true`                      |
| ChromaDB (`CHROMA_URL`)           | Only for `/v1/rag/*`                                    | Chroma RAG                                                             |
| Redis (`ENABLE_REDIS`)            | Optional, but several features fail without it          | Goals, token usage, MinIO file index, catalogue cache, `/v1/redis`     |
| MinIO (`ENABLE_MINIO`)            | Optional, **but the env vars must be set**              | `/v1/minio`, chat attachments                                          |
| Kafka                             | Inactive (init commented out)                           | `/v1/kafka`, catalogue request logging                                 |
| Slack                             | Optional                                                | Error notifications                                                    |
| YouTube Data API                  | Optional                                                | Goals course search                                                    |
| HuggingFace (network)             | On first Laya call                                      | Laya model download                                                    |
| jsDelivr CDN (network)            | On first OCR call                                       | Tesseract language data                                                |
