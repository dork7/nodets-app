# Redis key/value API and Kafka (`/v1/redis/*`, `/v1/kafka/*`)

## Redis API

### What it does

A thin CRUD API over Redis keys, mainly for testing. Values are stored as JSON with a default TTL of 3600 s.

### Code

`src/api/redis/*`, `src/services/redisStore.ts` (the `redis` helper) and `src/config/redisStore.ts` (the client: DB 5, `redis://REDIS_HOST:REDIS_PORT`).

### Endpoints

| Method | Path             | Body                | Success                                                        |
| ------ | ---------------- | ------------------- | -------------------------------------------------------------- |
| POST   | `/v1/redis/:key` | `{ id: number, … }` | `"OK"` (set with a 1-hour TTL)                                 |
| GET    | `/v1/redis/:key` | —                   | The stored JSON                                                |
| PUT    | `/v1/redis/:key` | `{ id: number, … }` | Shallow-merges into the existing value. **The TTL is removed** |
| DELETE | `/v1/redis/:key` | —                   | Number of keys deleted                                         |

### Errors

| Status | Message                                                     | Cause                                                                                                          |
| ------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 400    | `Invalid input: body,id Required` / `Expected number`       | Body without a numeric `id`                                                                                    |
| 404    | `Data not found`                                            | GET or DELETE of a missing key                                                                                 |
| 500    | `Cannot add data into redis:, The client is closed , <key>` | Redis isn't connected (`ENABLE_REDIS` off, or `ENV` isn't `local`). The message says "add" for every operation |
| 500    | `…Unexpected token … is not valid JSON`                     | The key holds a non-JSON value written by something else                                                       |

### Other Redis users

These features also need Redis and fail when it is down:

- goals ([goals.md](goals.md))
- token usage ([ai-utils.md](ai-utils.md), [chat-websocket.md](chat-websocket.md))
- the MinIO file index ([file-storage.md](file-storage.md))
- the catalogue cache ([catalogue-cache.md](catalogue-cache.md))

Connection errors are logged with `logger.error(err, 'Redis error')`, so they are also sent to Slack.

## Kafka

### Status: inactive

`initKafka()` is commented out in `src/server.ts:68`. The producer and consumer are created but **never connected**.

### What it would do

- **Producer:** `sendMessage(config, message, correlationId)` sends JSON to a topic, with `correlation-id` and `ENV` headers.
- **Consumer:** subscribes to the topics in `src/common/data/kafkaTopics.ts` (`test`, `logging`, `file`, …) and appends messages to `file.txt`. That file feeds `GET /dashboard` ([platform.md](platform.md)).
- **Request logging:** `reqLoggerKafka` publishes each `/v1/catalogue` request and response to the `logging` topic.

### Code

`src/config/kafka.ts`, `src/services/kafkaService.ts`, `src/api/kafka/*`, `src/common/middleware/reqLoggerKafka.ts`, `src/common/data/kafkaTopics.ts`.

### Endpoint

| Method | Path                    | Body                                    | Success             |
| ------ | ----------------------- | --------------------------------------- | ------------------- |
| POST   | `/v1/kafka/postMessage` | `{ config: { topic, … }, data: { … } }` | Kafka's send result |

### Errors

| Status        | Message                                                             | Cause                                                                           |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 400           | `Invalid input: body,config Required` / `body,data Required`        | Missing objects                                                                 |
| 500           | `Unable to send message, The producer is disconnected` (or similar) | Kafka isn't initialised. This is the expected result while Kafka stays disabled |
| 500           | `Unable to send message, …`                                         | Broker unreachable (`KAFKA_BROKER`), unknown topic                              |
| Log and Slack | `Error sending message to Kafka: , Topic: …`                        | Every failed send, including the automatic catalogue logging                    |

### Known issues

- **Every `/v1/catalogue` request triggers an unhandled rejection** while Kafka is disabled (see [catalogue-cache.md](catalogue-cache.md)).
- **`reqLoggerKafka` sends after the response.** It sends the Kafka message after `res.send` and returns `undefined` instead of `res`.
- **`kafkaRepository.ts` is an empty stub.**
