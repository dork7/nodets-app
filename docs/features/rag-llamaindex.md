# RAG: LlamaIndex and Qdrant (`/v1/llamaIndex/*`)

## What it does

Stores user documents as vectors in Qdrant and retrieves them per user. This is the RAG pipeline the chatbot uses (`/ws/chatAI` with `rag: true`). Documents are tagged with a `type` and a `userId`, and retrieval is always filtered by `userId`.

## Code

| File                              | Role                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `src/api/llamaIndex/router.ts`    | Routes and multipart handling                                  |
| `src/api/llamaIndex/service.ts`   | Ingest, query, extract, delete, clear                          |
| `src/api/llamaIndex/model.ts`     | Zod schemas                                                    |
| `src/config/qdrantStore.ts`       | Cached `QdrantVectorStore`                                     |
| `src/config/llamaConfig/index.ts` | LlamaIndex `Settings`: an OpenRouter LLM and embedder          |
| `src/api/rag/extractText.ts`      | Text extraction (see [text-extraction.md](text-extraction.md)) |

## Endpoints

| Method | Path                                         | Input                                                                                                                      | Success                                                                                                                   |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/v1/llamaIndex/ingest`                      | multipart: `file` (≤10MB), `type`, `userId`, optional `id`                                                                 | `{ id, filename, type }`                                                                                                  |
| POST   | `/v1/llamaIndex/ingest/:id`                  | JSON `{ type, userId }`; `:id` = a localStorage/fs-util file id                                                            | `{ id, filename, type }`                                                                                                  |
| GET    | `/v1/llamaIndex/extract?q&k&userId&minScore` | `q` required; `k` 1–20 (default 3); `userId` required; optional `minScore` 0–1 drops chunks with a lower cosine similarity | `{ extractedText, sources, chunks }`: raw chunks joined by `\n`, plus each chunk's `text`, `score` and `metadata`; no LLM |
| GET    | `/v1/llamaIndex/query?q&k&userId&minScore`   | same                                                                                                                       | `{ extractedText, sources }`: an **LLM-written answer** from the retrieved chunks                                         |
| DELETE | `/v1/llamaIndex/file/:id`                    | —                                                                                                                          | `true`                                                                                                                    |
| DELETE | `/v1/llamaIndex`                             | —                                                                                                                          | `true` (drops the whole collection)                                                                                       |

## How ingest works (`indexBuffer`, `service.ts:70`)

1. `extractText(buffer, filename)`, then trim. If the result is empty, throw `NoExtractableTextError`.
2. Write a copy of the file to `./ragStorage/<docId>-<filename>`.
3. `index.insert(new Document({ id_: docId, text, metadata: { type, filename, userId } }))`. LlamaIndex's default splitter chunks the text, and OpenRouter embeds it.
4. Make sure the Qdrant payload indexes on `doc_id` and `userId` exist, so filtering works on Qdrant Cloud's strict mode.
5. Set `LocalFileModel.ingested = true` for the matching `fileId`.

Deleting a document uses `index.deleteRefDoc(id)` and resets `ingested`. Clearing deletes the collection and resets the cached store, the index and all `ingested` flags.

## Configuration

- **Qdrant:** `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION_NAME`
- **Embeddings and LLM (via OpenRouter):** `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_EMBED_MODEL`. The LLM used by `/query` is hard-coded to `meta-llama/llama-3.1-8b-instruct`.
- **Extraction:** `OCR_ENABLED`, `OCR_LANGS`

## Errors

| Status                         | Message                                                                           | Cause / fix                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400                            | `type is required` / `userId is required`                                         | Missing form or JSON field                                                                                                                                                |
| 400                            | `No file provided`                                                                | Multipart field isn't called `file`, or it's empty                                                                                                                        |
| 413                            | `File too large`                                                                  | Over 10MB (multer `LIMIT_FILE_SIZE`)                                                                                                                                      |
| 400                            | `Unexpected field` (or another Multer message)                                    | Wrong multipart field name or shape                                                                                                                                       |
| 400                            | `No extractable text found in "<name>".`                                          | Empty document, or an image or scanned PDF with `OCR_ENABLED=false`                                                                                                       |
| 500                            | `Failed to index file: Cannot ingest "<name>": .<ext> files are not supported. …` | Unsupported type (the `UnsupportedFileTypeError` is **not** mapped to 4xx here)                                                                                           |
| 500                            | `Failed to index file: … the file looks binary, not text.`                        | Binary content with a text extension                                                                                                                                      |
| 500                            | `Failed to index file: <Qdrant/OpenRouter error>`                                 | Qdrant unreachable (`fetch failed`, `ECONNREFUSED`), bad `OPENROUTER_API_KEY` (401), embed model unavailable, or embedding dimension doesn't match an existing collection |
| — hangs                        | An OCR worker can't download its language data (offline or a wrong `OCR_LANGS`)   | See [text-extraction.md](text-extraction.md)                                                                                                                              |
| 404                            | `File <id> not found in local storage`                                            | `/ingest/:id` with an unknown id, or a DB record whose file is missing on disk                                                                                            |
| 400                            | `Invalid input: query,q …` / `query,userId …` / `query,k …`                       | Missing `q` or `userId`, or `k` outside 1–20                                                                                                                              |
| 500                            | `Failed to query index: <error>`                                                  | Qdrant down; filter rejected because the `userId` payload index is missing (strict mode) before the first ingest; OpenRouter embedding failure; `/query` LLM failure      |
| 200 with empty `extractedText` | Nothing ingested for that `userId`, or no match                                   | Not an error                                                                                                                                                              |
| 500                            | `Failed to remove document from index: …`                                         | Qdrant down, or the `doc_id` payload index is missing under strict mode. Deleting an id that was never ingested succeeds (no-op)                                          |
| 500                            | `Failed to clear index: …`                                                        | Mongo update failed. A failing Qdrant delete is only logged as a warning and still returns success                                                                        |
| Log only                       | `Failed to ensure <field> payload index: …`                                       | Qdrant rejected index creation. Filtered queries may then fail with 500                                                                                                   |

## Known issues

- **No ownership checks.** `userId` is whatever the client sends. `DELETE /file/:id` doesn't check it, and `DELETE /v1/llamaIndex` wipes every user's data. `/ingest/:id` can index any stored file under any `userId`.
- **Re-ingesting duplicates chunks.** `index.insert` adds new nodes without removing the old ones for the same `docId`.
- **The `ragStorage/` copy is write-only.** Nothing reads it or deletes it.
- **Path traversal risk.** The multipart `id` and the uploaded `filename` go into the `ragStorage` path without sanitising.
- **Unsupported file types return 500, not 415.**
- **The OpenAPI docs are incomplete.** `/query` and `/extract` don't document `k` or `userId`.
- **`LlamaIndexIngestSchema` isn't used.** The multipart route validates by hand.
