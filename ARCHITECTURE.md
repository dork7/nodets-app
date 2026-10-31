# Architecture

Graph-form reference for this repository. Diagrams reflect the code as of the `rag-system` branch (2026-09-27) — file paths and function names are taken directly from source, not invented.

## 1. System overview

```mermaid
graph TD
    subgraph Entry["Boot (src/index.ts)"]
        SERVER["src/server.ts<br/>Express app"]
        WSBOOT["startWebSocketServer()<br/>src/ws/server/index.ts"]
        LOADAI["loadAIProviders()<br/>config/openaiConfig/loadAIProviders.ts"]
        LOADH["loadHandlers()<br/>ws/server/methods.ts"]
    end

    subgraph HTTP["HTTP API — mounted under /v1 (src/api/index.ts)"]
        GOALS["goals<br/>src/api/goals"]
        LAYA["laya<br/>src/api/laya"]
        RAG["rag<br/>src/api/rag"]
        LLAMA["llamaIndex<br/>src/api/llamaIndex"]
        VISION["vision / nutrition<br/>src/api/vision"]
        CHAT["chat<br/>src/api/chat"]
        MINIO_R["minio<br/>src/api/minio"]
        LOCALSTORE["localStorage<br/>src/api/localStorage"]
        FS["fs-util<br/>src/api/fileStorage"]
        MONITOR["monitor<br/>src/api/monitor"]
        OTHER["redis, kafka, catalogue,<br/>taskPlanner, settings,<br/>aiProviders, aiUtils"]
    end

    subgraph WS["WebSocket server — one WSS on the HTTP port"]
        WSPATH{"URL path"}
        REGISTRY["/ws/server, /ws/stream<br/>registry.ts + methods.ts<br/>(ping, getTime, getUsers, stream...)"]
        CHATBOT["/ws/chatAI<br/>chatbotHandler()<br/>ws/server/handlers/chatbot/index.ts"]
    end

    subgraph AILayer["AI provider layer (config/openaiConfig)"]
        CALLAI["callAI() / openai proxy"]
        PREG["registry.ts (name → client Map)"]
        LOCALAI_P["providers/localAI.ts"]
        OR_P["providers/openRouterAI.ts"]
        OLLAMA_P["providers/ollamaAI.ts"]
    end

    subgraph Vector["Vector-store subsystems"]
        CHROMA_PIPE["ragService (Chroma)<br/>src/api/rag/ragService.ts"]
        LLAMA_PIPE["llamaIndexService (Qdrant)<br/>src/api/llamaIndex/service.ts"]
    end

    subgraph Data["Persistence & infra"]
        MONGO[("MongoDB<br/>chat history, AI call logs")]
        REDIS[("Redis<br/>response cache — ENABLE_REDIS")]
        MINIO_S[("MinIO<br/>object storage — ENABLE_MINIO")]
        KAFKA[("Kafka<br/>wired but init disabled")]
    end

    subgraph External["External services"]
        OPENAI_EXT["OpenAI API"]
        OR_EXT["OpenRouter"]
        LOCALAI_EXT["LocalAI (self-hosted)"]
        OLLAMA_EXT["Ollama (self-hosted)"]
        QDRANT_EXT[("Qdrant")]
        CHROMA_EXT[("ChromaDB")]
        YT_EXT["YouTube Data API"]
    end

    Entry --> SERVER
    SERVER --> HTTP
    Entry --> WSBOOT --> WS
    Entry --> LOADAI --> AILayer
    Entry --> LOADH --> REGISTRY

    WSPATH -->|"/ws/server, /ws/stream"| REGISTRY
    WSPATH -->|"/ws/chatAI"| CHATBOT

    CHATBOT --> CALLAI
    GOALS --> CALLAI
    VISION --> CALLAI
    LAYA -.->|"@receptron/laya (local ONNX, no callAI)"| LAYA
    CHATBOT --> LLAMA_PIPE
    RAG --> CHROMA_PIPE
    LLAMA --> LLAMA_PIPE

    CALLAI --> PREG
    PREG --> LOCALAI_P & OR_P & OLLAMA_P
    LOCALAI_P --> LOCALAI_EXT
    OR_P --> OR_EXT
    OLLAMA_P --> OLLAMA_EXT
    LOCALAI_EXT -.default fallback.-> OPENAI_EXT

    CHROMA_PIPE --> CHROMA_EXT
    LLAMA_PIPE --> QDRANT_EXT

    GOALS --> YT_EXT

    CHATBOT --> MONGO
    MONITOR --> MONGO
    HTTP -.optional.-> REDIS
    HTTP -.optional.-> MINIO_S
    LOCALSTORE --> MINIO_S
    FS --> MINIO_S
    HTTP -.wired, inactive.-> KAFKA
```

**Reading it:** one Express `app` and one `WebSocketServer` share the same HTTP port (`src/index.ts`). REST features under `/v1/*` and the `/ws/chatAI` WebSocket path both call into the shared AI provider layer (`callAI`) rather than talking to OpenAI-compatible SDKs directly. `laya` is the one AI-ish feature that doesn't use `callAI` — it runs a local ONNX model via `@receptron/laya` in-process. There are two separate, non-overlapping vector-store pipelines (see diagram 2) — this is the fact most likely to trip up someone modifying RAG behavior in only one of them.

## 2. RAG ingestion & retrieval pipeline

```mermaid
graph TD
    UPLOAD["File upload<br/>(multipart, via localStorage/minio/fs-util routers)"]
    EXTRACT["extractText(buffer, filename)<br/>src/api/rag/extractText.ts<br/>— pdf-parse / mammoth / plain-text whitelist"]

    subgraph PipelineA["Pipeline A: /v1/rag (ChromaDB)"]
        LOADERS["loaders.{json,minio,localStorage,csv,url}<br/>src/api/rag/loaders.ts"]
        CHUNK["chunkDocument()<br/>src/api/rag/chunker.ts<br/>(~500 char chunks, 50 char overlap)"]
        EMBED_A["embedMany()<br/>config/openaiConfig/embeddings.ts"]
        UPSERT["upsertMany()<br/>src/services/vectorStore.ts"]
        CHROMADB[("ChromaDB collection<br/>RAG_COLLECTION_NAME")]
        SEARCH["ragService.search()<br/>→ queryCollection()"]
    end

    subgraph PipelineB["Pipeline B: /v1/llamaIndex + chatbot RAG (Qdrant) — the one the live chatbot uses"]
        INDEXBUF["indexBuffer()<br/>src/api/llamaIndex/service.ts<br/>wraps text in a LlamaIndex Document"]
        LIINDEX["VectorStoreIndex.insert()<br/>(LlamaIndex embeds internally via embedModel)"]
        QDRANTDB[("Qdrant collection<br/>QDRANT_COLLECTION_NAME")]
        RETRIEVE["llamaIndexService.extract(query, topK)<br/>index.asRetriever().retrieve()"]
    end

    UPLOAD --> EXTRACT
    EXTRACT --> LOADERS --> CHUNK --> EMBED_A --> UPSERT --> CHROMADB
    CHROMADB --> SEARCH

    EXTRACT --> INDEXBUF --> LIINDEX --> QDRANTDB
    QDRANTDB --> RETRIEVE

    QUERY["User chat message<br/>(WS /ws/chatAI, message.rag = true)"]
    RELEVANCE["isRagAnswerRelated(query, extractedText)<br/>ws/server/handlers/chatbot/utils/ragUtils.ts<br/>LLM yes/no classifier via buildRagRelevancePrompt()"]
    DROP["Context discarded<br/>(logged, no system message injected)"]
    GUARDRAIL["buildRagGuardrailPrompt(extractedText)<br/>config/prompt.ts<br/>unshifted as a system message"]
    LLMCALL["callAI() → chat completion<br/>(streamed or non-streamed)"]

    QUERY --> RETRIEVE
    RETRIEVE --> RELEVANCE
    RELEVANCE -->|no| DROP
    RELEVANCE -->|yes| GUARDRAIL --> LLMCALL
```

**Reading it:** every file, regardless of which pipeline ingests it, goes through the same `extractText()` extension whitelist (plain text, `.json`/`.jsonl`/`.xml`/config/code formats, plus dedicated PDF and DOCX parsers). From there the two pipelines diverge completely — **Pipeline A** (`/v1/rag/*`) chunks text itself and stores vectors in ChromaDB; it's reachable only via its own REST endpoints and nothing else in the app calls it. **Pipeline B** (`/v1/llamaIndex/*`) lets LlamaIndex manage chunking/embedding internally and stores vectors in Qdrant; this is the pipeline the `/ws/chatAI` handler actually uses when a message sets `rag: true`. Before Pipeline B's retrieved context is ever shown to the model, `isRagAnswerRelated()` runs a cheap LLM classification of "is this context relevant to the query" — irrelevant matches are dropped instead of being injected, so a near-miss vector hit can't derail an unrelated answer.

## Known gaps / things not to assume

- The README.md at the repo root is stale (original `express-typescript-2024` boilerplate copy); it does not describe the RAG/chatbot/goals/laya features. Treat CLAUDE.md and this file as the current source of truth instead.
- Kafka (`config/kafka.ts`) is registered but its `initKafka()` call is commented out in `src/server.ts` — code exists, but it does not run.
- Whether Pipeline A (Chroma) is still actively maintained or is legacy from an earlier iteration of the RAG feature is not something the code states explicitly — it is simply unreferenced by the chatbot. Confirm with the project owner before removing it.
