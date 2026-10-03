# Learning goals tracker (`/v1/goals/*`, `GET /goals`)

## What it does

Tracks learning goals. For each goal you:

- get subtopics suggested by an LLM
- attach a YouTube course to each topic (chosen from a search, with its duration used as the hour estimate)
- log study hours

The server works out progress stats on every change: logged vs estimated hours, pace, projected completion date, and whether you're on track for the deadline. The `/goals` page (`src/public/goals.ejs`) is the UI.

## Code

| File                                             | Role                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `src/api/goals/goalsRouter.ts` / `goalsModel.ts` | Routes and Zod schemas                                                   |
| `src/api/goals/goalsService.ts`                  | Business logic, `computeDerived`, LLM and YouTube calls                  |
| `src/api/goals/goalsRepository.ts`               | **Redis** storage: `goal:<id>` JSON (no expiry) plus a `goals:index` set |
| `src/config/prompt.ts`                           | `buildTopicSuggestionPrompt`                                             |

## Endpoints

Topics are addressed by their **array index** (`topicIndex`).

| Method | Path                                                  | Body / query                                       | Result                                                                    |
| ------ | ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/v1/goals`                                           | —                                                  | All goals, oldest first                                                   |
| POST   | `/v1/goals`                                           | `{ title, targetDeadline? }`                       | New goal. Its id is a slug of the title (`-2`, `-3`, … added if taken)    |
| GET    | `/v1/goals/:id`                                       | —                                                  | Goal                                                                      |
| DELETE | `/v1/goals/:id`                                       | —                                                  | `{ deleted: true }`                                                       |
| POST   | `/v1/goals/:id/suggest-topics`                        | `{ count? (1–15, default 8), provider? }`          | `[{ name, description? }]`. Suggestions only; nothing is saved            |
| POST   | `/v1/goals/:id/topics`                                | `{ topics: [{ name, description? }] }` (min. 1)    | Goal with the topics appended                                             |
| DELETE | `/v1/goals/:id/topics/:topicIndex`                    | —                                                  | Goal                                                                      |
| GET    | `/v1/goals/:id/topics/:topicIndex/suggest-courses?q=` | Optional search override                           | Top 3 YouTube videos by view count, each with `durationHours`             |
| PUT    | `/v1/goals/:id/topics/:topicIndex/course`             | `{ course?, estimatedHours }`                      | Goal                                                                      |
| PUT    | `/v1/goals/:id/topics/:topicIndex/estimate`           | `{ estimatedHours }`                               | Goal                                                                      |
| PUT    | `/v1/goals/:id/topics/:topicIndex/complete`           | `{ completed }`                                    | Goal                                                                      |
| PUT    | `/v1/goals/:id/topics/:topicIndex/notes`              | `{ notes \| null }`                                | Goal                                                                      |
| POST   | `/v1/goals/:id/log`                                   | `{ hours > 0, topic?, note?, date? (YYYY-MM-DD) }` | Goal. If `topic` matches a topic name, that topic's `loggedHours` goes up |
| PUT    | `/v1/goals/:id/deadline`                              | `{ targetDeadline \| null }`                       | Goal                                                                      |

**Derived stats** (worked out in UTC):

- **Status:** `completed` when there are estimated hours and none remain; `in-progress` when any hours are logged; otherwise `not-started`.
- **Pace:** logged hours ÷ days since the first log entry.
- **Projected date:** today + the days still needed at the current pace.
- **Required pace:** remaining hours ÷ days until the deadline.
- **`onTrack`:** actual pace ≥ required pace. It is `false` once the deadline has passed and hours remain.

## Configuration

- **Topic suggestions:** `OPENROUTER_CHAT_MODEL` or `LOCALAI_CHAT_MODEL`, depending on `provider`.
- **Course search:** `YOUTUBE_API_KEY`.
- **Storage:** Redis (`ENABLE_REDIS=true` and `ENV=local`; see [platform.md](platform.md)).

## Errors

| Status     | Message                                                                                                          | Cause / fix                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 400        | `Invalid input: body,title …`, `params,topicIndex …`, `body,hours Number must be greater than 0`, …              | Invalid input                                                                                             |
| 404        | `Goal not found`                                                                                                 | Unknown id                                                                                                |
| 404        | `Topic not found`                                                                                                | `topicIndex` out of range. Indexes shift after a topic is removed, so a stale page may send the wrong one |
| 503        | `YOUTUBE_API_KEY is not configured on the server. Set it in .env to enable course search.`                       | Missing key                                                                                               |
| 500        | `Error suggesting courses …: YouTube search failed with status 403` (or `400` / `429`)                           | Invalid key, quota exceeded, or the API isn't enabled for the key                                         |
| 200 `[]`   | `No videos found`                                                                                                | No results (not an error)                                                                                 |
| 500        | `Error suggesting topics for goal …: Unexpected token … is not valid JSON` / `Model did not return a JSON array` | The LLM didn't return a bare JSON array                                                                   |
| 500        | `Error suggesting topics …: Connection error.`                                                                   | LocalAI down (the default provider). Send `provider: "openrouter"` to use OpenRouter                      |
| 500        | `Error creating goal: The client is closed` (and the same for every endpoint)                                    | **Redis isn't connected.** All goal storage is in Redis                                                   |
| 500 (list) | `Error listing goals: …`                                                                                         | Same. The response still has `responseObject: []`                                                         |

## Known issues

- **Goals depend entirely on Redis**, which only connects when `ENV=local` and `ENABLE_REDIS=true`. Anywhere else, every goal endpoint fails.
- **Topics are addressed by array index.** Two browser tabs can edit the wrong topic after a removal.
- **Concurrent writes can lose updates.** Every update is read → modify → write of the whole goal JSON with no locking.
- **`topic` matching in `/log` is by exact name.** A typo logs the hours to the goal but not to any topic.
- **Suggestions are not monitored.** They bypass `callAI` and aren't logged.
