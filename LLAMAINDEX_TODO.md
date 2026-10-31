# LlamaIndex RAG — Review & Next Steps

Snapshot from a review on 2026-09-27 of `src/api/llamaIndex/*`, `src/config/llamaConfig/`, `src/config/qdrantStore.ts`, and how the chatbot (`src/ws/server/handlers/chatbot/index.ts`) consumes it. See `ARCHITECTURE.md` for the full pipeline diagram.

## What exists today

- **`src/config/llamaConfig/index.ts`** — sets LlamaIndex's global `Settings.llm` and `Settings.embedModel`, both hardcoded to OpenRouter (`meta-llama/llama-3.1-8b-instruct` for the LLM; `text-embedding-3-small` for embeddings, only the embed model configurable via `OPENROUTER_EMBED_MODEL`).
- **`src/config/qdrantStore.ts`** — one lazily-created `QdrantVectorStore`, single global collection (`QDRANT_COLLECTION_NAME`), with a reset hook for after `clear()`.
- **`src/api/llamaIndex/service.ts`** — `ingestFile` / `ingestFileFromStorage` (extract → write a copy to `ragStorage/` → wrap as a `Document` tagged with `type` → `index.insert()` → ensure a `doc_id` payload index → flip `LocalFileModel.ingested`), `query()` (full LLM-synthesized answer via `asQueryEngine()`), `extract()` (raw retrieval, no LLM — what the chatbot actually calls), `deleteFile()`, `clear()`.
- **`src/api/llamaIndex/router.ts`** — REST surface: `POST /ingest`, `POST /ingest/:id`, `GET /query`, `GET /extract`, `DELETE /file/:id`, `DELETE /`.
- **Chatbot integration** — `/ws/chatAI` calls `.extract()`, runs the result through `isRagAnswerRelated()`, then injects `buildRagGuardrailPrompt()` before the model call. This is the only place the pipeline is consumed end-to-end today.

## Gaps found

- [x] **No per-user/session isolation** — ~~everything lands in one global Qdrant collection. Any user's chat can retrieve any other user's ingested documents.~~ **Fixed 2026-09-27**: a required `userId` field now tags every ingested document's metadata and scopes every retrieval (`extract`/`query`) via a Qdrant payload-index filter. A "User ID" field on the frontend (`src/public/chatAI.ejs`) persists it in `localStorage` and blocks ingest/RAG-send with an inline error until it's filled in; the WS handler and REST routes independently reject RAG requests/ingests missing `userId` (400 / `stream_error`) so the check can't be bypassed by calling the API directly.
- [ ] **Hardcoded, provider-locked LLM config** — `llamaConfig` always talks to OpenRouter directly, bypassing the app's `callAI`/provider-registry abstraction (LocalAI/Ollama/OpenRouter) that every other feature uses. `/llamaIndex/query` can never run against a local model.
- [ ] **`type` tag is write-only** — captured at ingest, stored as metadata, never used to filter a query. No Qdrant payload index exists for it either (only `doc_id` does).
- [ ] **`/llamaIndex/query` duplicates the chatbot's own flow** (retrieval + guardrail + `callAI`) but with a different, hardcoded model — decide if it's a real standalone feature or dead weight.
- [ ] **No chunk-size control** — LlamaIndex handles splitting internally with defaults; the older Chroma pipeline (`src/api/rag/chunker.ts`) has explicit 500-char/50-overlap chunking. Large docs could produce oversized embed calls or too-coarse retrieval.
- [ ] **No "list ingested documents" endpoint** for the LlamaIndex collection (id, filename, type, ingested date).
- [ ] **No tests** for the LlamaIndex service or router.

## Suggested next steps (priority order)

1. [x] **Scope retrieval to the requesting user/session** — done, see above.
2. [ ] **Route LlamaIndex's LLM through `callAI`/the provider registry** instead of a hardcoded OpenRouter client, for consistency with the rest of the app.
3. [ ] **Wire up `type`-filtered retrieval** — add a Qdrant payload index for `type`, accept an optional `type` filter on `/extract` and the chatbot's `rag` flag.
4. [ ] **Resolve the two-RAG-pipeline situation** (Chroma vs Qdrant, flagged in `ARCHITECTURE.md`) — decide whether to retire `/v1/rag/*`.
5. [ ] **Add a list-ingested-docs endpoint** and basic service-level tests (mock Qdrant + embeddings).
