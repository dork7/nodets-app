# Platform: boot, configuration, middleware, errors, health check, API docs

## What it does

This is the foundation every feature runs on. It covers:

- starting the HTTP and WebSocket server on one port
- loading and validating configuration
- the Express middleware chain
- error handling
- the health-check endpoints
- the Swagger UI

## Code

| File                                       | Role                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                             | Starts the server, registers WS handlers and AI providers, and handles shutdown and process-level errors |
| `src/server.ts`                            | Express app: middleware, EJS page routes, the Slack-forwarding `logger`                                  |
| `src/common/utils/envConfig.ts`            | `envalid` schema for every env var                                                                       |
| `src/common/middleware/*`                  | Error handler, rate limiter, request logger, cache, Kafka logging, proxy flagging                        |
| `src/common/utils/httpHandlers.ts`         | `handleServiceResponse`, `validateRequest`                                                               |
| `src/api/healthCheck/healthCheckRouter.ts` | Health endpoints                                                                                         |
| `src/api-docs/*`                           | OpenAPI document and Swagger UI                                                                          |

## Boot sequence

1. **Importing `src/server.ts`** has several side effects:
   - It validates the env vars.
   - It computes the cache rule hashes.
   - It connects Redis and initialises MinIO only when `ENV === 'local' && ENABLE_REDIS` (see Known issues).
   - It calls `connectMongoDB()` unconditionally.
   - It builds the middleware chain.
2. `app.listen(env.PORT)` starts the server. In the listen callback:
   - `loadHandlers()` registers the WebSocket RPC methods.
   - `loadAIProviders()` registers `localAI`, `openRouterAI` and `ollama`.
   - `startWebSocketServer(server)` attaches `ws` to the same HTTP server.
3. On `SIGINT` or `SIGTERM`:
   - Open WebSocket clients are terminated.
   - `server.close()` runs.
   - After 10 seconds the process is force-exited with code 1.

## Middleware order (`src/server.ts:78-157`)

1. `cors({ origin: CORS_ORIGIN, credentials: true })`
2. `helmet()`, which applies a strict default CSP. Some pages override it (see below).
3. `rateLimiter`: `COMMON_RATE_LIMIT_MAX_REQUESTS` per `15 × 60 × COMMON_RATE_LIMIT_WINDOW_MS` ms, keyed by IP.
4. `requestLogger` (pino-http, enabled only when `NODE_ENV=production`)
5. `express.json()` and `bodyParser.urlencoded`
6. `proxyHandler`: flags requests to exactly `/v1/catalogue` for Kafka logging.
7. `reqLoggerKafka`
8. `cacheConfigHandler` and `cacheHandler` (Redis response cache, see [catalogue-cache.md](catalogue-cache.md))
9. `/v1` API routes
10. Page routes: `/dashboard`, `/chatAI`, `/goals`, `/chatModels`
11. Swagger (`/swagger.json`, and `/` for the UI)
12. Error handlers: a 404 fallback, an error recorder, and the JSON error writer.

## Endpoints

| Method | Path                  | Result                                                                                                                                                                                                                                                                                   |
| ------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/health-check`    | `200 "Service is healthy"`                                                                                                                                                                                                                                                               |
| GET    | `/v1/health-check/db` | Opens a separate Mongo connection and pings it. `200` on success. `503 "MongoDB connection failed: <reason>"` if the ping fails or doesn't answer within 5 seconds                                                                                                                       |
| GET    | `/swagger.json`       | The OpenAPI 3 document                                                                                                                                                                                                                                                                   |
| GET    | `/`                   | Swagger UI                                                                                                                                                                                                                                                                               |
| GET    | `/dashboard`          | Renders `src/public/index.ejs` from `file.txt` (the Kafka consumer's output)                                                                                                                                                                                                             |
| GET    | `/v1/dashboard`       | Reads `file.txt` (and discards it), then renders `path.join(__dirname, 'public')` with hard-coded data. Returns `500 "Failed to load dashboard"` if `file.txt` is missing. Under `tsx` (`npm run dev`), `__dirname` is `src/api`, which has no `public/`, so the render also fails there |

Some routers (`localStorage`, `fs-util`, `minio`, `monitor`, `nutrition`) are **not** registered in `openAPIDocumentGenerator.ts`, so they don't appear in Swagger.

## Configuration

`envalid` rejects a missing variable that has no default, and the process **exits at startup**.

**Variables that must be set** (they have no default):

- `NODE_ENV`, `ENV`, `HOST`, `PORT`, `BASE_URL`, `CORS_ORIGIN`, `API_VERSION`, `CLIENT_ID`
- `COMMON_RATE_LIMIT_MAX_REQUESTS`, `COMMON_RATE_LIMIT_WINDOW_MS`
- `REDIS_HOST`, `REDIS_PORT`, `KAFKA_BROKER`
- `MONGO_URI_LOCAL`, `MONGO_URI_TESTS_LOCAL`, `MONGO_URI`, `MONGO_URI_TESTS`
- `SLACK_TOKEN`, `SLACK_CHANNEL`
- `PRODUCTS_API` (must be a URL)
- `OPENAI_API_KEY`

Tests get defaults for some of these via `testOnly(...)`.

**Read straight from `process.env` and not validated:**

- `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
- `LOCAL_STORAGE_DIR`, `LOCAL_STORAGE_FOLDER`, `MAX_FILE_SIZE`
- `LOCALAI_URL`, which is **also** read raw in `getLocalAILLMs.ts`, with a different default
- `LOCALAI_RELEVANCE_MODEL`, read raw by the chatbot's relevance checks

## Page CSP overrides

| Page                          | CSP set by the route                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/chatAI`                     | `script-src 'self' 'nonce-abc123'` only. This replaces helmet's header entirely, so other directives fall back to browser defaults |
| `/goals`                      | `default-src 'self'; script-src 'self' 'unsafe-inline'; …`                                                                         |
| `/v1/monitor/dashboard`       | Allows inline scripts and `https://cdn.jsdelivr.net` (Chart.js)                                                                    |
| `/v1/taskPlanner/dashboard`   | Allows inline scripts                                                                                                              |
| `/dashboard`, `/v1/nutrition` | helmet default (`script-src 'self'`)                                                                                               |

## Errors

| Error                                                | When                                                                                                        | What you see                                                                                               | Fix                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `EnvError: Missing environment variable …`           | Startup                                                                                                     | The process exits before listening                                                                         | Set the variable (see the list above)                            |
| `InvalidEndpointError: Invalid endPoint : undefined` | Startup, when `MINIO_ENDPOINT` is unset, **even if `ENABLE_MINIO=false`**                                   | The process crashes on import                                                                              | Set `MINIO_ENDPOINT` (and `MINIO_PORT`) even if MinIO isn't used |
| `MongoDB connection error: …`                        | Startup, or when a connection `error` event fires later                                                     | `process.exit(1)` or `process.exit(-1)`. Note the log call is `logger.info`, so it isn't shown as an error | Check `MONGO_URI` and that Mongo is running                      |
| `MongoDB disconnected! Trying to reconnect...`       | Mongo drops                                                                                                 | `connectDB()` is called again, and it exits if that fails                                                  |                                                                  |
| Uncaught exception or unhandled rejection            | Anywhere                                                                                                    | **Only logged.** The process keeps running                                                                 | Check the logs. Errors that were silently swallowed show up here |
| 404 with a plain-text body                           | Unknown route                                                                                               | `Not Found`, not JSON                                                                                      |                                                                  |
| 429                                                  | Rate limit exceeded                                                                                         | Text body                                                                                                  | Raise `COMMON_RATE_LIMIT_MAX_REQUESTS`                           |
| 400 JSON parse                                       | Malformed JSON body                                                                                         | `ServiceResponse`                                                                                          | Send valid JSON with `Content-Type: application/json`            |
| 500 `Failed to load dashboard`                       | `GET /dashboard` when `file.txt` doesn't exist. It is only written by the Kafka consumer, which is disabled | JSON error                                                                                                 | Create `file.txt` (JSON lines) or re-enable Kafka                |
| `/dashboard` loads but jQuery is blocked             | helmet's CSP blocks the `ajax.googleapis.com` script in `index.ejs`                                         | Browser console CSP error                                                                                  | Relax the CSP for this route, as the other pages do              |
| 503 `MongoDB connection failed: …`                   | `GET /v1/health-check/db`                                                                                   | JSON                                                                                                       | Check Mongo                                                      |

## Known issues

- **Redis and MinIO initialisation are gated together.** `src/server.ts:61` only runs when `ENV === 'local' && ENABLE_REDIS`:
  - MinIO is never initialised when Redis is disabled, even with `ENABLE_MINIO=true`.
  - Neither starts when `ENV` is anything other than `local`.
- **The Mongo URL doesn't depend on environment.** `src/config/mongoose.ts` always uses `MONGO_URI`. `MONGO_URI_LOCAL` and the `*_TESTS*` variables are required but never used.
- **Stray `console.warn`.** The `logger` proxy prints `[Proxy-Alert] A critical error event is being logged.` for every error.
- **The test suite fails at baseline.** `openAPIRouter.test.ts` and `healthCheckRouter.test.ts` fail with `Cannot read properties of undefined (reading 'info')`, most likely a circular import of `logger` from `@/server`. `requestLogger.test.ts` fails with a socket hang-up.
