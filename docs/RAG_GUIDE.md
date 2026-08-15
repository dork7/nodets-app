# RAG System — Complete Pipeline Guide

A from-scratch, end-to-end guide for building a Retrieval-Augmented Generation (RAG) pipeline inside this Express + TypeScript app.

**Stack in use:** LocalAI (LLM + embeddings), ChromaDB (vector store), MinIO (object storage), Redis (chat history), tesseract.js (OCR), Express + zod (REST API), WebSocket (chat).

**Companion files:** `rag.js` is the standalone proof-of-concept (reference only). `rag.md` is the earlier integration plan. This guide is the authoritative, complete reference.

---

## 1. What RAG is and why it works

The model is not trained on *your* data. Asking it to answer from memory produces hallucinations. RAG fixes this with three steps:

1. **Retrieve** the most relevant text chunks from a vector database (embedding similarity, not keyword match).
2. **Augment** the prompt by injecting those chunks as context.
3. **Generate** the answer conditioned on that context, so the model cites your data instead of guessing.

```
┌─ INGEST ─────────────────────────────────────────────────────────┐
│  Sources → Parser → Chunker → Embedder → Vector DB (Chroma)      │
│  (data.json, MinIO files, PDF, OCR images, CSV, URL)             │
└──────────────────────────────────────────────────────────────────┘

┌─ QUERY ──────────────────────────────────────────────────────────┐
│  User msg → Embed question → top-k search → build context        │
│  → inject system prompt → LocalAI chat (stream) → WebSocket      │
└──────────────────────────────────────────────────────────────────┘
```

**The golden rule:** the *same embedding model* must be used for ingest and query. Mixing models silently breaks retrieval — there are no errors, just bad answers.

---

## 2. The 8 pipeline stages

### Stage 1 — Ingestion

Every source type the pipeline supports, normalized to a common shape.

| Source | Parser | Caveats |
|--------|--------|---------|
| `data.json` | `JSON.parse` → per-entry Document | Keep it small for demos |
| MinIO text files | reuse `getFileText` (`src/ws/server/handlers/chatbot/utils/imageHandler.ts:36`) | cap file size (50k chars already enforced) |
| PDF | extract text from buffer | multiline layout → chunk on paragraphs |
| Images / scanned docs | **tesseract.js OCR** (already a dependency) | slow; cache results; skip already-ingested ids |
| CSV | row-per-chunk | header row → column names |
| URL | HTTP fetch → HTML-to-text | respect `robots.txt`, strip scripts/styles |

Common output shape:

```ts
interface Document {
  id: string;      // deterministic hash of source + content
  text: string;
  source: string;  // 'data.json' | 'minio' | 'pdf' | 'image' | 'csv' | 'url'
  meta?: Record<string, unknown>;
}
```

### Stage 2 — Parsing

Normalize every source into `Document[]`. Keep parsers isolated per source so a new file type is a one-file change. Never crash the whole ingest batch because one file failed — collect per-file errors and continue.

### Stage 3 — Chunking

Vector search works on *chunks*, not whole documents. Embeddings have token limits and long texts dilute similarity.

```ts
function chunkText(text: string, size = 500, overlap = 50): string[] {
  // split on paragraph/sentence boundaries first, then merge
  // until near `size` chars; keep `overlap` chars from the end
  // of the previous chunk so context survives the split.
}
```

- `size` ~500 chars is a safe default for LocalAI embed models.
- `overlap` (10%) preserves context across boundaries.
- **Context budget:** `RAG_TOP_K` × chunk size must stay well under the LLM context window. Chunk size matters as much as `k`.

### Stage 4 — Embedding

Call the OpenAI-compatible embeddings endpoint. Same model for ingest and query — always.

```ts
// POST {LOCALAI_URL}/v1/embeddings
{ model: LOCALAI_EMBEDDING_MODEL, input: text }
// → { data: [{ embedding: number[] }] }
```

Prefer `embedMany(texts)` over a loop — one request, and the model is loaded once. Batch sizes of ~16-32 keep latency and memory sane.

### Stage 5 — Vector storage

ChromaDB collection `knowledge_base` (`RAG_COLLECTION_NAME`).

```ts
await collection.upsert({
  ids,               // deterministic, so re-ingest is idempotent
  embeddings,        // from Stage 4
  documents,         // original chunk text
  metadatas,         // source, timestamp, etc.
});
```

Idempotency matters: re-running ingest with the same ids **updates** instead of duplicating.

### Stage 6 — Retrieval

Embed the user's question (same model), then top-k cosine search.

```ts
const res = await collection.query({
  queryEmbeddings: [questionEmbedding],
  nResults: RAG_TOP_K,        // default 3
});
// → res.documents[0]  = chunk texts
//   res.metadatas[0]  = sources (for UI "sources" line)
```

Return both the text **and** the source metadata — the UI can show where the answer came from.

### Stage 7 — Augmentation

Build the system prompt by injecting the retrieved chunks. This is the "Augment" step.

```ts
const systemPrompt = `Answer only based on the provided context.
If the context does not contain the answer, say you don't know.

Context:
${retrievedChunks.join('\n\n')}`;
```

### Stage 8 — Generation

Send the chat request to LocalAI exactly as `rag.js` does today (`rag.js:53-59`), but with the system prompt prepended. Stream the response back over the WebSocket.

---

## 3. Architecture in this app

```
                            ┌────────────────────┐
                            │   chatAI.ejs (UI)  │
                            └────────┬───────────┘
                                     │ ws
                            ┌────────▼───────────┐
                            │ ws/server/chatAI   │  chatbotHandler
                            │ (retrieve + inject)│  src/ws/server/handlers/chatbot/index.ts
                            └────────┬───────────┘
                 ┌───────────────────┼───────────────────┐
                 │ embed question    │ build system msg  │
                 ▼                   ▼                   ▼
        ┌────────────────┐   ┌──────────────┐   ┌────────────────┐
        │ embeddings.ts  │   │ vectorStore  │   │ callAI()       │
        │ (LocalAI)      │──▶│ (ChromaDB)   │   │ (LocalAI chat) │
        └────────────────┘   └──────────────┘   └────────────────┘
                                          ▲
        ┌──────────────────────────────────┴──────────────────────┐
        │ RAG REST API (/v1/rag)  → ingest / search / clear / stats│
        │   → loaders (json/minio/pdf/ocr/csv/url) → chunker → upsert │
        └─────────────────────────────────────────────────────────┘
```

| Component | Tech | Location |
|-----------|------|----------|
| LLM + embeddings | LocalAI (`http://localhost:8080`) | `src/openai/embeddings.ts` (new) |
| Vector database | ChromaDB (`http://localhost:8000`) | `src/services/vectorStore.ts` (new) |
| Loaders + chunker | Node + tesseract.js | `src/api/rag/ingest/` (new) |
| RAG REST API | Express + zod | `src/api/rag/ragRouter.ts` (new) |
| Chat integration | WebSocket handler | `src/ws/server/handlers/chatbot/index.ts` |
| Chat UI | EJS | `src/public/chatAI.ejs` |
| Legacy prototype | standalone script | `rag.js` (reference only) |

---

## 4. Environment configuration

```ini
# RAG
CHROMA_URL=http://localhost:8000
RAG_COLLECTION_NAME=knowledge_base
RAG_ENABLED=false
RAG_TOP_K=3

# AI
LOCALAI_URL=http://localhost:8080
LOCALAI_EMBEDDING_MODEL=nemotron-3-embed-1b-q4
```

> **Fail-open by default:** `RAG_ENABLED=false` means if Chroma or LocalAI is down, chat still works — it just skips retrieval. Retrieval errors must never break a chat turn.

---

## 5. REST API surface

```
POST   /v1/rag/ingest
  body: { source: 'json' | 'minio' | 'pdf' | 'image' | 'csv' | 'url',
          fileId?: string, url?: string }
  → 201 { count }

GET    /v1/rag/search?q=...&k=3
  → { results: [{ text, source, score? }] }   # debug endpoint

DELETE /v1/rag
  → 204   # clear the collection

GET    /v1/rag/stats
  → { count }   # number of indexed chunks
```

---

## 6. Implementation order (staged)

| Stage | Scope | Verify |
|-------|-------|--------|
| 0 | This guide | — |
| 1 | env config + `embeddings.ts` + `vectorStore.ts` | `npx tsc --noEmit` |
| 2 | loaders + chunker + `ragService.ts` | ingest script against real Chroma |
| 3 | `ragRouter.ts` + OpenAPI + mount | curl endpoints |
| 4 | chat handler hookup (retrieve + inject) | chat in UI |
| 5 | (optional) UI toggle + sources line | chat in UI |

---

## 7. How to test

```bash
# 1. start ChromaDB
docker compose -f ai-docker-compose.yml up chromadb -d

# 2. ingest documents (from data.json)
curl -X POST http://localhost:2020/v1/rag/ingest \
  -H 'Content-Type: application/json' -d '{"source":"json"}'

# 3. inspect
curl http://localhost:2020/v1/rag/stats
curl "http://localhost:2020/v1/rag/search?q=delivery%20UAE&k=3"

# 4. chat in UI with RAG enabled, ask about office hours / delivery
# open http://localhost:2020/chatAI
```

Expected: `ingest` returns `{"count": 3}`, `search` for "delivery UAE" returns chunk id 2 (`"We deliver products across UAE..."`), and the chat answers from the knowledge base instead of inventing facts.

---

## 8. Gotchas checklist

- [ ] **Same embedding model** for ingest and query — the #1 silent killer.
- [ ] **Fail-open** — RAG must never take down chat; wrap retrieval in try/catch.
- [ ] **Context budget** — `RAG_TOP_K` small (3); chunk size counts as much as `k`.
- [ ] **Deterministic ids** — re-ingest updates instead of duplicating.
- [ ] **OCR is slow** — cache extracted text; batch tesseract jobs.
- [ ] **chromadb v3 API** — async client (`upsert`/`query`), not the old sync `add`.
- [ ] **Env var typo** — existing `LOCALAI_EMBDED_MODEL` (`envConfig.ts:36`) is misspelled; add a canonical `LOCALAI_EMBEDDING_MODEL` and migrate.
- [ ] Pre-existing TS errors in `src/api/kafka` and `src/api/minio` are unrelated to RAG work.