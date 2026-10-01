# Chat REST API (`POST /v1/ai/chat`)

## What it does

A single, non-streaming chat completion over HTTP. It doesn't store history, and it doesn't support RAG or tools. Every call is logged for the monitoring dashboard.

## Code

`src/api/chat/chatRouter.ts`, `chatService.ts`, `chatModel.ts`.

## Endpoint

`POST /v1/ai/chat` with a JSON body:

| Field         | Type                                           | Notes                                                                                 |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `messages`    | `[{ role: system\|user\|assistant, content }]` | Min. 1; each `content` must be non-empty                                              |
| `prompt`      | string                                         | Used when `messages` is missing or empty                                              |
| `provider`    | string                                         | `"openrouter"` (case-insensitive) selects OpenRouter; **anything else** means LocalAI |
| `model`       | string                                         | Defaults to `OPENROUTER_CHAT_MODEL` or `LOCALAI_CHAT_MODEL`                           |
| `temperature` | number 0–2                                     | Optional                                                                              |

At least one of `messages` or `prompt` is required.

**Success (200):**

```json
{ "reply": "…", "reasoning": "…", "model": "…", "provider": "openrouter|localai", "usage": { … } }
```

`reasoning` is included only when the provider returns it.

## Flow

1. Validate the request with Zod.
2. Use `messages` if present; otherwise build a single user message from `prompt`.
3. Call `client.chat.completions.create` directly, on either `openRouterAIInstance` or the `openai` proxy (LocalAI). This bypasses `callAI`.
4. Log the result to the monitor, for both success and failure.

## Errors

| Status | Message                                                                              | Cause                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `Invalid input: … Provide either "messages" or "prompt".`                            | Neither field was sent                                                                                                                     |
| 400    | `Invalid input: body,messages,0,content String must contain at least 1 character(s)` | An empty message `content`                                                                                                                 |
| 400    | `Invalid input: body,temperature …`                                                  | Temperature outside 0–2                                                                                                                    |
| 400    | `At least one non-empty message is required.`                                        | Only whitespace was sent                                                                                                                   |
| 500    | `Failed to process the chat request with AI: <provider error>`                       | Provider down, bad key, unknown model or context overflow. The response body's `stack` holds the error's stack trace (in all environments) |
| —      | The request **hangs** when a provider call fails and `ENABLE_SLACK_LOGGING=false`    | See Known issues                                                                                                                           |

## Known issues

- **Failed requests hang when Slack is off.** On any provider error, `chatService.ts:114` awaits `sendSlackNotification`. When `ENABLE_SLACK_LOGGING` is false, that function returns from its promise executor without resolving (`src/common/utils/slack.ts:17-22`). The promise never settles, so the error response is never sent, the failure is never logged to the monitor, and the client waits until it times out. It only affects the failure path.
- **The provider strings differ from the WebSocket chatbot** (`openrouter` here vs `openRouterAI` there).
- **Leaks stack traces.** The `stack` field is included in failed responses in every environment.
