# chatAI.ts — Request Flow Graph

Visual overview of the WebSocket `chatAI` handler.

## Message Flow

```mermaid
flowchart TD
    A[WebSocket Message Received] --> B{isStopStreamMessage?}
    B -- yes --> C[Abort active request]
    B -- no --> D[Create AbortController + register in activeAIRequests]

    D --> E[Extract prompt / imageId / model / stream flag]
    E --> F{imageId present?}
    F -- yes --> G[getImageDataUrl: fetch image from MinIO -> base64 data URL]
    F -- no --> H

    G --> H[getChatHistory: load previous history from MongoDB]
    H --> I{history over CHAT_HISTORY_COMPACT_THRESHOLD_CHARS?}
    I -- yes --> J[compactHistory: summarize older messages into one system message]
    I -- no --> K
    J --> K[buildConversationHistory: append the new user message]
    K --> L[saveChatHistory: persist the compacted history to MongoDB]
    L --> M[send stream_start over WS]
    M --> N[buildAIMessages: attach image to last user message]
    N --> O[callAI: invoke LLM with abort signal]

    O --> P{isStreaming?}
    P -- yes --> Q[handleStreamingResponse: iterate chunks, forward stream_continue]
    P -- no --> R[handleNonStreamingResponse: send single stream_continue]

    Q --> S[Collect tokenUsage from final chunk]
    R --> S

    S --> T{total_tokens > 0?}
    T -- yes --> U[saveTokenUsage: accumulate usage in Redis]
    T -- no --> V

    U --> V[send stream_end / stream_stopped with tokenUsage]
    V --> W[saveChatHistory: persist final assistant message]

    W --> X{error?}
    X -- yes --> Y[catch: send stream_error or stream_stopped]
    X -- no --> Z[finally: unregister AbortController from activeAIRequests]
    Y --> Z
```

## Module Dependency Graph

```mermaid
flowchart LR
    subgraph Handler["chatAI.ts"]
        H[handler]
        HS[handleStreamingResponse]
        HNS[handleNonStreamingResponse]
    end

    Redis[(Redis store)]
    MinIO[(MinIO bucket)]

    H --> Redis
    H --> MinIO
    H --> HS
    H --> HNS

    subgraph openai["@/openai"]
        AI[callAI]
        CH[compactHistory]
    end

    HS --> AI
    HNS --> AI
    H --> CH
    CH --> AI
```

## Key Functions

| Function | Purpose |
| --- | --- |
| `handler` | Entry point; routes stop/chat requests, orchestrates history, AI call, and token usage. |
| `handleStreamingResponse` | Consumes `AsyncIterable<AIResponseChunk>`, streams `stream_continue` chunks, captures token usage. |
| `handleNonStreamingResponse` | Sends a single `stream_continue` with the full response. |
| `compactHistory` | Once the stored history exceeds `CHAT_HISTORY_COMPACT_THRESHOLD_CHARS`, summarizes all but the `CHAT_HISTORY_KEEP_RECENT` latest messages into one system message, using the chat's provider/model. Fails open. |
| `buildConversationHistory` | Appends the new user message to the (compacted) history. |
| `getImageDataUrl` | Resolves an uploaded image id to a base64 data URL via MinIO. |
| `saveTokenUsage` | Accumulates per-session token usage in Redis. |

## WebSocket Message Types Emitted

| Type | When |
| --- | --- |
| `stream_start` | Before the AI call begins; `historyCompacted` is true when this turn compacted the history. |
| `stream_continue` | Per response chunk (streaming) or once (non-streaming). |
| `stream_end` | Successful completion, includes `tokenUsage`. |
| `stream_stopped` | Request aborted via `stop_stream` or an aborted request. |
| `stream_error` | Handler error, includes `error` message. |
