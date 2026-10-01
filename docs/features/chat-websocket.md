# Chatbot over WebSocket (`/ws/chatAI`)

## What it does

This is the main chat experience. The `GET /chatAI` page (`src/public/chatAI.ejs`) opens a WebSocket to `/ws/chatAI` and sends one JSON message per user turn. For each turn the server:

- loads the session history
- attaches uploaded images and files
- optionally injects RAG context from Qdrant
- calls the model, streaming or not
- runs a tool-calling loop
- saves history and token usage
- logs the call for monitoring

## Code

| File                                      | Role                                                              |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `src/ws/server/index.ts:133`              | Routes `/ws/chatAI` connections to `chatbotHandler`               |
| `src/ws/server/handlers/chatbot/index.ts` | Main handler                                                      |
| `…/chatbot/utils/history.ts`              | Builds the conversation history                                   |
| `…/chatbot/utils/imageHandler.ts`         | Loads attachments from MinIO; builds multimodal content           |
| `…/chatbot/utils/ragUtils.ts`             | LLM yes/no check: is the retrieved context relevant?              |
| `…/chatbot/utils/relationCheck.ts`        | LLM yes/no check: is the new message related to the previous one? |
| `…/chatbot/utils/tokenUsage.ts`           | Adds up token usage in Redis                                      |
| `src/models/chatHistory.model.ts`         | Mongo `ChatHistory` (1-hour TTL)                                  |
| `src/public/chatAI.ejs`                   | UI                                                                |

## Protocol

**Client to server** (one message per turn):

```json
{
 "id": "<sessionId>",
 "method": "chatAI",
 "type": "request",
 "model": "…",
 "provider": "localAI | openRouterAI | ollama",
 "stream": true,
 "rag": false,
 "userId": "<required when rag is true>",
 "ragDistance": 0.5,
 "params": {
  "prompt": "…",
  "imageIds": ["<fileId>"],
  "imageId": "<fileId>",
  "fileIds": ["<fileId>"]
 }
}
```

To stop a response in progress, send `{ "type": "stop_stream", "id": "<sessionId>" }`.

**Server to client:**

| `type`            | When                                                        | Key fields                                                                         |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `stream_start`    | After preprocessing, before the model call                  | `isRelated`, `requestStartTime`, `ragSources`                                      |
| `stream_continue` | Each streamed delta, or the whole reply when not streaming  | `aiResponse` (`{ content }`), `isRelated`. `id` is only present when not streaming |
| `stream_end`      | Finished                                                    | `tokenUsage`, `ragSources`, `requestStartTime`, `requestEndTime`                   |
| `stream_stopped`  | Stopped by the user, or a stop arrived with nothing running | timings                                                                            |
| `stream_error`    | Any failure                                                 | `error` (message)                                                                  |

## Flow (`chatbotHandler`)

1. **Stop request:** a `stop_stream` message aborts the active request for that `id`.
2. **Supersede:** a new message on the same `id` aborts any request still running on that session.
3. **RAG guard:** if `rag` is true and there is no `userId`, send `stream_error "Please provide a User ID to use RAG."` and stop.
4. **Attachments:** resolve `imageIds` to base64 data URLs, and `fileIds` to text through `extractText` (first 50,000 characters), both **from MinIO**.
5. **History:** load the Mongo history for `id`, run the relation check against the previous message, append the user message and save.
6. **RAG:** when enabled:
   - Call `llamaIndexService.extract(prompt, RAG_TOP_K, userId)`.
   - If text came back and the relevance check says "yes", add `buildRagGuardrailPrompt(text)` to the front as a system message. It goes into the model messages only, not the saved history.
7. **Model call:** send `stream_start`, then loop up to 5 times: `callAI`, then handle the streaming or non-streaming response. If the model asked for tools, run them, append the results and call again.
8. **Finish:** add up token usage in Redis, send `stream_end` (or `stream_stopped`), save the history, and log to the monitor (skipped if aborted).

## Configuration

`RAG_TOP_K`, `LOCALAI_RELEVANCE_MODEL` (read from `process.env`), the provider settings, and the MinIO env vars for attachments.

## Errors

| Error (sent as `stream_error.error` unless noted)                            | Cause                                                                                                                                                                                                                                                                          | Fix                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `Please provide a User ID to use RAG.`                                       | `rag: true` without `userId`                                                                                                                                                                                                                                                   | Enter a User ID in the UI                                                  |
| `No OpenAI-compatible model instance registered for provider: X`             | `provider` isn't a registry name (e.g. `openrouter`)                                                                                                                                                                                                                           | Use `localAI`, `openRouterAI` or `ollama`                                  |
| `Connection error.` / `ECONNREFUSED`                                         | The selected provider is down                                                                                                                                                                                                                                                  | Start LocalAI or Ollama, or switch provider                                |
| `404` / `model not found`                                                    | `model` isn't on that provider                                                                                                                                                                                                                                                 | Pick a model listed by `/chatModels`                                       |
| `400 … context length` / `maximum context`                                   | History (which grows every turn, up to the 1-hour TTL) plus attachments exceed the model's context                                                                                                                                                                             | Start a new chat (`/new`) or clear the history                             |
| `No response message found in AI response`                                   | Non-streaming response with no `choices[0].message`                                                                                                                                                                                                                            | Provider or model issue                                                    |
| The attachment is silently missing from the answer                           | `getImageDataUrl` or `getFileText` returned `null`. Causes: MinIO isn't configured or reachable; the file was uploaded to fs-util/localStorage rather than MinIO; the file type isn't supported; OCR failed. Only logged (`Image not found for id …`, `Error fetching file …`) | See Known issues                                                           |
| RAG context silently not used                                                | `extract` failed (Qdrant down, logged as `Failed to query index`), or found no chunks for that `userId`, or the relevance check said "no"                                                                                                                                      | Check the logs for `RAG context discarded` or `Failed to query index`      |
| The turn takes a long time before `stream_start`                             | The relation check and RAG relevance check each call LocalAI with `LOCALAI_RELEVANCE_MODEL`, even when another provider is selected. If LocalAI is down, each waits for its connection error and then **fails open** (returns true)                                            | Start LocalAI, or set a reachable model                                    |
| Nothing happens (no error)                                                   | The socket isn't open. The UI's `send()` silently drops the message                                                                                                                                                                                                            | Wait for the "Connected" system message. The UI reconnects every 5 seconds |
| Server log `chatAI handler error: …`                                         | An exception escaped the handler                                                                                                                                                                                                                                               | Check the logs                                                             |
| Server log `Error saving chat history …` / `Error retrieving chat history …` | Mongo write or read failed. The chat continues without history                                                                                                                                                                                                                 | Check Mongo                                                                |
| Server log `Error saving token usage …`                                      | Redis isn't connected. Usage isn't counted, and the error is also sent to Slack                                                                                                                                                                                                | Enable Redis                                                               |

## Known issues

- **Attachments are read from MinIO, but the UI uploads them to fs-util/localStorage** (`imageHandler.ts:12`, `chatAI.ejs:4339`). Unless MinIO is enabled and holds the same ids, attachments resolve to `null` and are dropped silently.
- **History is always sent.** `buildConversationHistory(..., true)` at `index.ts:348` ignores the relation check. `isRelated` is informational only (shown in the UI).
- **History is keyed by the session `id`, not by user**, and expires 1 hour after the last update (TTL index).
- **Tool calling never triggers**, because `callAI` overrides `tools` with `[]` (see [ai-providers.md](ai-providers.md)).
- **`ragDistance` is accepted but never used.**
- **`ragSources` repeat the full text.** Every source carries the whole concatenated text and `score: 0`; the real scores are thrown away.
- **Streamed `stream_continue` messages have no `id`**, so a client can't match chunks to requests.
- **Wrong `env` import.** `ragUtils.ts` and `relationCheck.ts` import `env` from Node's `'process'` rather than `envConfig`, so `LOCALAI_RELEVANCE_MODEL` has no default. `.env.template` doesn't set it, so with a template-based `.env` the model is `undefined`, both checks error on every turn and fail open, and the relation check always reports "related".
- **OCR on attachments** runs synchronously inside the turn (see [text-extraction.md](text-extraction.md)).
