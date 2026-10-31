# WebSocket RPC (`/ws/server` and `/ws/stream`)

## What it does

A generic "call a named method over WebSocket" channel that shares the HTTP port. Methods are looked up by name in a registry. `/ws/chatAI` is separate: see [chat-websocket.md](chat-websocket.md).

## Code

| File                          | Role                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `src/ws/server/index.ts`      | Accepts connections and routes by URL path                 |
| `src/ws/server/registry.ts`   | Name-to-handler `Map`                                      |
| `src/ws/server/methods.ts`    | `loadHandlers()`: static list of handler modules           |
| `src/ws/server/handlers/*.ts` | One module per method, each exporting `name` and `handler` |

## Registered methods

| `method`  | Handler signature | Returns                                                                                                                                                             |
| --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ping`    | `()`              | `"pong"`                                                                                                                                                            |
| `getTime` | `()`              | `{ time: ISOString }`                                                                                                                                               |
| `getUser` | `(params)`        | `{ id: params.userId, name: "John Doe" }` (stub)                                                                                                                    |
| `stream`  | `(ws, message)`   | Sends `stream_start`, then `stream_chunk` 1…`params.n` (default 5), then `stream_end`                                                                               |
| `openai`  | `(ws, message)`   | Sends `stream_start` and `stream_continue` (AI text), then `stream_end`, or `stream_error`. Uses `callAI(message.model, [{ role:'user', content: params.prompt }])` |

## Paths and protocol

**`/ws/server`**: the handler is called as `handler(parsedMessage)`.

1. **Every** message first gets a `{ type: 'capabilities', tools: ['ping','countTo','getTime'] }` reply.
2. Then comes the result: `{ type: 'response', id: <new uuid>, result }`.
3. With `?type=broadcast` in the connection URL, the result goes to every _other_ client instead of the sender.

**`/ws/stream`**: the handler is called as `handler(ws, parsedMessage)` and sends its own frames.

On both paths:

- Messages that aren't JSON are wrapped as `{ content: <raw> }`.
- Every call is logged to the monitor (`provider: 'websocket'`).

**Any other path:** the server sends `{ type: 'error', error: 'Unknown URL: <url> ' }` and ignores later messages.

## Errors

| Frame                                                      | Cause                                                                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `{ type: 'error', id, error: 'Unknown method: <method>' }` | `method` is missing or not registered, e.g. `countTo`, which is advertised in `capabilities` but doesn't exist   |
| `{ type: 'error', id, error: <message> }`                  | The handler threw (`/ws/server` only)                                                                            |
| No reply                                                   | On `/ws/stream`, when a handler throws, the error is logged to the monitor but **nothing is sent** to the client |
| `{ type: 'stream_error', error }`                          | The `openai` method's model call failed (provider down, empty or unknown model)                                  |
| `{ type: 'error', error: 'Unknown URL: …' }`               | Connected to an unknown path                                                                                     |

## Known issues

- **The advertised tool list is wrong.** `capabilities` lists `countTo`, which doesn't exist, and leaves out `stream`, `openai` and `getUser`. It is also sent before every response, not once per connection.
- **Mismatched method signatures.** On `/ws/server`, handlers that expect `(ws, message)` (`stream`, `openai`) receive the message as `ws` and fail. Only call them on `/ws/stream`.
- **Path matching is loose.** Routing uses `url.includes(...)`, so `/foo/ws/server/bar` also matches.
- **No authentication** on any WebSocket path.
