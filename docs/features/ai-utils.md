# AI utilities (`/v1/aiUtils/*`)

## What it does

Supporting endpoints for the chat UI:

- read and clear chat history
- per-session and total token usage
- list and unload LocalAI models, and unload Docker Model Runner models
- text-to-speech

## Code

`src/api/aiUtils/aiUtilsRouter.ts` and `aiUtilsService.ts`. Data comes from Mongo (`ChatHistory`), Redis (`token_usage_<id>`), LocalAI's HTTP API, and the `docker` CLI.

## Endpoints

| Method | Path                                       | Input                              | Success                                                                                                          |
| ------ | ------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/aiUtils/chat-history/:userId`         | `userId` = the chat **session id** | The **user** messages only, newest first                                                                         |
| DELETE | `/v1/aiUtils/chat-history/:userId`         | —                                  | `{ cleared: true }`; also deletes that session's token usage                                                     |
| GET    | `/v1/aiUtils/token-usage/:userId`          | —                                  | `{ prompt_tokens, completion_tokens, total_tokens }` (zeros if none)                                             |
| GET    | `/v1/aiUtils/total-token-usage?sessionId=` | Optional `sessionId`               | That session's usage, or the sum over every `token_usage_*` key (Redis `SCAN`)                                   |
| GET    | `/v1/aiUtils/loaded-models`                | —                                  | `[{ model }]` from LocalAI `GET /system`                                                                         |
| POST   | `/v1/aiUtils/unload-model`                 | `{ model }`                        | LocalAI `POST /backend/shutdown`                                                                                 |
| POST   | `/v1/aiUtils/unload-models`                | —                                  | Runs `docker model list --openai`, then `docker model unload <m>` for each model                                 |
| POST   | `/v1/aiUtils/text-to-speech`               | `{ text, voice? }`                 | `{ audio: <base64 mp3>, contentType: 'audio/mpeg' }` via LocalAI `audio.speech` (`tts-1`, default voice `alloy`) |

Token usage keys expire 1 hour after the last update, and chat history expires 1 hour after its last update.

## Errors

| Status   | Message                                                                                                    | Cause / fix                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400      | `Invalid input: params,userId User ID is required` / `body,model Model name is required` / TTS body errors | Missing input                                                                                                                                        |
| 200 `[]` | `No chat history found` / `No user messages found in chat history`                                         | Unknown or expired session (not an error)                                                                                                            |
| 500      | `Error retrieving chat history for user …`                                                                 | Mongo error                                                                                                                                          |
| 500      | `Error clearing chat history …: The client is closed`                                                      | **Redis is down.** The Mongo history has **already been deleted** by then; only the token-usage reset failed                                         |
| 500      | `Error retrieving token usage for user …: The client is closed`                                            | Redis isn't connected. These endpoints require Redis                                                                                                 |
| 500      | `Error retrieving total token usage: …`                                                                    | Redis down, or a `token_usage_*` value isn't valid JSON                                                                                              |
| 500      | `Error retrieving loaded models: LocalAI returned status <n>` / `This operation was aborted`               | LocalAI returned an error, or took more than 5 seconds                                                                                               |
| 500      | `Error unloading model <m>: …`                                                                             | Same, from `/backend/shutdown`                                                                                                                       |
| 500      | `Unable to retrieve LLM models`                                                                            | `docker model list` failed: Docker isn't installed or running, the model plugin is missing, or the server runs in a container without the Docker CLI |
| 500      | `One or more LLM models failed to unload`                                                                  | Some `docker model unload` calls failed. `responseObject.failed` lists them                                                                          |
| 500      | `Error generating text-to-speech: …`                                                                       | LocalAI down, or no `tts-1` model / the voice isn't installed                                                                                        |

## Known issues

- **Parameter names say `userId` but hold session ids.** The history and token-usage routes are called with the chat **session id**, because that is how the chatbot keys them.
- **LocalAI URL mismatch.** These endpoints use `LOCALAI_URL` from `getLocalAILLMs.ts` (raw `process.env`, default `http://localhost:8080`), not the validated env value (see [ai-providers.md](ai-providers.md)).
- **`unload-models` runs shell commands on the server.** Anyone who can reach the API can unload every model.
