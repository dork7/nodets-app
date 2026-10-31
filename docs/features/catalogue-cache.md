# Catalogue and response caching (`/v1/catalogue/*`)

## What it does

A sample products API.

- **Reads** proxy an external products API (`PRODUCTS_API`), validate its response shape with Zod, and can be cached in Redis.
- **Writes and deletes** change an **in-memory mock array** that the reads never use.
- Requests to exactly `/v1/catalogue` are also flagged for Kafka request logging.

## Code

| File                                                                  | Role                                            |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `src/api/catalogue/catalogueRouter.ts` / `catalogueModel.ts`          | Routes and schemas                              |
| `src/api/catalogue/catalogueService.ts`                               | Reads from `PRODUCTS_API` through `customAxios` |
| `src/api/catalogue/catalogueRepository.ts`                            | In-memory mock array (two seed items)           |
| `src/config/axios.ts`                                                 | Axios instance, 10 s timeout                    |
| `cacheRules.ts` (repo root)                                           | Which requests are cached, and the TTL          |
| `src/config/cacheConfig.ts` / `src/common/middleware/cacheHandler.ts` | Cache key hashing and Redis get/set             |
| `src/common/middleware/proxy.ts` / `reqLoggerKafka.ts`                | Kafka logging flag and hook                     |

## Endpoints

| Method | Path                   | Behaviour                                                                                     |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/v1/catalogue`        | `GET PRODUCTS_API`; validates `data.products` as an array of catalogue items; returns `data`  |
| GET    | `/v1/catalogue?id=<n>` | `GET PRODUCTS_API/<n>`; validates a single item                                               |
| GET    | `/v1/catalogue/:id`    | Numeric positive id; `GET PRODUCTS_API/<id>`. Not covered by the cache rules, so never cached |
| POST   | `/v1/catalogue`        | Adds to the in-memory array (lost on restart) and returns the whole array (201)               |
| DELETE | `/v1/catalogue/:id`    | Removes from the in-memory array (202)                                                        |
| DELETE | `/v1/catalogue/all`    | Empties the in-memory array (202)                                                             |

## Response caching

`cacheRules.ts` caches `GET /v1/catalogue` (with or without `?id`) for 3600 s.

1. **Rule match:** `cacheConfigHandler` matches the request on its path and query-key names.
2. **Cache key:** it hashes `{ url, query, body }`.
3. **Lookup:** `cacheHandler` answers from Redis on a hit. On a miss, it stores successful responses.

**Response headers:**

- `x-cached`: `HIT` / `MISS` / `MISS-failedResponse`
- `x-cached-get`: `HIT` / `MISS`

**Request headers:**

- `Cache-Control: max-age=0` deletes the cached entry first.

## Errors

| Status                                  | Message                                                                                                                                         | Cause                                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400                                     | `Invalid input: params,id ID must be a numeric value` / `ID must be a positive number`                                                          | Bad `:id`                                                                                                                                               |
| 500                                     | `Error finding all catalogue: $Connection error`                                                                                                | `PRODUCTS_API` host not found (`ENOTFOUND`)                                                                                                             |
| 500                                     | `Error finding all catalogue: $Cannot read properties of undefined (reading 'products')`                                                        | Any other upstream failure: timeout, 5xx, refused. `customAxios` **returns** errors instead of throwing, so the code reads `.data` from an error object |
| 404                                     | `catalogue not found`                                                                                                                           | Upstream returned 404                                                                                                                                   |
| 500                                     | `…: Invalid input: <path> <reason>`                                                                                                             | The upstream response doesn't match `CatelogueAPIRespSchema`                                                                                            |
| 500                                     | `Error finding catalogue with id <n>:, …`                                                                                                       | Same failures for the by-id path                                                                                                                        |
| 404                                     | `catalogue not found` (DELETE)                                                                                                                  | The id isn't in the in-memory array, or the array is already empty (`/all`)                                                                             |
| Unhandled promise rejection in the logs | Every request to exactly `/v1/catalogue` tries to send a Kafka log. Kafka is never connected, so `producer.send` rejects and nothing catches it | See Known issues                                                                                                                                        |

## Known issues

- **The cache middleware breaks when Redis is down** (`cacheHandler.ts:29-40`). When Redis isn't ready, it calls `next()` but doesn't `return`. It then awaits `redis.getValue`, which throws `The client is closed`. The request is still served by the first `next()`, but every cached-route request leaves an unhandled rejection in the logs. If `getValue` ever resolved instead, `next()` would run a second time.
- **Kafka logging fails on every request.** It is enabled for `/v1/catalogue` whatever the Kafka state (`proxy.ts`), so each request logs `Error sending message: … disconnected`, sends a Slack message, and leaves an unhandled rejection.
- **Reads and writes use different data.** Reads come from the external API; writes change a mock array.
- **`$` typo.** Error messages contain a stray `$` (`$${…}`) and `:,`.
