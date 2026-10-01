# Monitoring: AI call logs and dashboard (`/v1/monitor/*`)

## What it does

Records each AI call made through the chatbot, the chat REST API and the WebSocket RPC paths. Each record holds the provider, model, status, duration, prompt, error and token usage. It serves those records, together with live LocalAI Prometheus metrics, to a dashboard page that refreshes every 5 seconds.

## Code

| File                               | Role                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `src/services/monitorService.ts`   | `logCall`, `getRecentLogs`, `getModelStats`, `getAllModelStats`, `getModelMetrics`   |
| `src/models/aiCallLog.model.ts`    | Capped collection: 500 documents or 5MB, oldest evicted first                        |
| `src/models/aiModelStats.model.ts` | Per-model `totalCalls` and `totalDuration`, with a TTL of 1 hour after `lastUpdated` |
| `src/api/monitor/monitorRouter.ts` | Routes                                                                               |
| `src/public/monitor.ejs`           | Dashboard (Chart.js from jsDelivr)                                                   |

## Endpoints

| Method | Path                       | Returns                                                                                                                      |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/monitor/dashboard`    | HTML dashboard                                                                                                               |
| GET    | `/v1/monitor/logs`         | Up to 500 most recent `AiCallLog` entries                                                                                    |
| GET    | `/v1/monitor/models`       | LocalAI snapshot from `/metrics` and `/system`: loaded models, per-model requests and tokens, process memory, CPU and uptime |
| GET    | `/v1/monitor/stats`        | Persisted per-model counters, sorted by call count                                                                           |
| GET    | `/v1/monitor/stats/:model` | One model's counters. URL-encode model names that contain `/`                                                                |

## Who logs calls

- The `/ws/chatAI` handler: every turn except user-aborted ones, with the session id and token usage.
- `/v1/ai/chat`: success and failure.
- `/ws/server` and `/ws/stream`: every RPC call (`provider: 'websocket'`).

**Not logged:** vision, goals, LlamaIndex (embeddings or `/query`), Chroma embeddings, relevance/relation checks, and TTS.

## Errors

| Symptom                                        | Cause                                                                                                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/logs` or `/stats` return `[]` with 200       | Mongo read failed; only logged as `[Monitor] Failed to fetch logs` / `… all model stats`. Or nothing has been logged yet                                                                                         |
| `/stats/:model` returns 404 `Stats not found`  | The model has no calls in the last hour (TTL expired), or its name wasn't URL-encoded                                                                                                                            |
| `/models` returns `reachable: false` and zeros | LocalAI unreachable, slower than 5 seconds, or not LocalAI (e.g. Ollama returns 404 for `/metrics`). Logged at **warn** level on every 5-second dashboard poll: `[Monitor] LocalAI model metrics unavailable: …` |
| Server log `[Monitor] Failed to log AI call`   | Mongo write failed. The original request still completes, and the error is also sent to Slack                                                                                                                    |
| Dashboard charts are blank                     | Chart.js CDN blocked (no internet)                                                                                                                                                                               |

## Known issues

- **Model stats expire.** The `AiModelStats` TTL index deletes a model's counters after an hour of inactivity. "Persisted" stats therefore only survive restarts, not idle periods.
- **An existing uncapped collection stays uncapped.** If `aicalllogs` already exists without the cap, Mongoose doesn't convert it and the collection grows without limit.
- **LocalAI URL mismatch.** `getModelMetrics` uses `LOCALAI_URL` from `getLocalAILLMs.ts`, which is raw `process.env` with a different default (see [ai-providers.md](ai-providers.md)).
