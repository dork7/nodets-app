# RAG: Chroma (`/v1/rag/*`)

## What it does

A second, independent RAG knowledge base backed by ChromaDB. It loads documents from several sources, splits them into chunks, embeds them through the app's provider layer, and supports vector search. **Nothing in the chatbot uses it**; it is REST only. Don't confuse it with the Qdrant pipeline in [rag-llamaindex.md](rag-llamaindex.md).

## Code

| File                                       | Role                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `src/api/rag/ragRouter.ts` / `ragModel.ts` | Routes and Zod schemas                                                    |
| `src/api/rag/ragService.ts`                | Ingest, search, delete, clear, stats, test-embed                          |
| `src/api/rag/loaders.ts`                   | Loaders for `json`, `minio`, `localStorage`, `csv` and `url` sources      |
| `src/api/rag/chunker.ts`                   | 500-character chunks with a 50-character overlap; ids are `${docId}#${i}` |
| `src/services/vectorStore.ts`              | Chroma client: get-or-create, upsert (batches of 4), query, delete        |
| `src/config/openaiConfig/embeddings.ts`    | `embedMany` (batches of 100)                                              |

## Endpoints

| Method | Path                 | Input                                                                  | Success                              |
| ------ | -------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| POST   | `/v1/rag/ingest`     | JSON `{ source, fileId?, bucket?, url?, content?, provider?, force? }` | 201 `{ count }` (number of chunks)   |
| GET    | `/v1/rag/search?q&k` | `q` required; `k` 1–20                                                 | `{ results: [{ id, text, score }] }` |
| DELETE | `/v1/rag/file/:id`   | —                                                                      | `{ removed }`                        |
| DELETE | `/v1/rag`            | —                                                                      | `true`                               |
| GET    | `/v1/rag/stats`      | —                                                                      | `{ count, collections }`             |
| POST   | `/v1/rag/test-embed` | `{ text, provider? }`                                                  | 201 `{ id }`                         |

**Sources:**

| `source`       | Reads                                                                     | Required field |
| -------------- | ------------------------------------------------------------------------- | -------------- |
| `json`         | `./data.json` (`[{ id, text }]`)                                          | —              |
| `minio`        | MinIO object with prefix `<fileId>-` in `bucket` (default `MINIO_BUCKET`) | `fileId`       |
| `localStorage` | Local-storage file by id                                                  | `fileId`       |
| `csv`          | `content` string; one document per row as `header: value` lines           | `content`      |
| `url`          | Fetches the URL and strips HTML tags                                      | `url`          |

File-based sources go through `extractText`, and only the first 50,000 characters are kept.

## Configuration

- **Chroma:** `CHROMA_URL`, `RAG_COLLECTION_NAME`
- **Embeddings:** `LOCALAI_EMBEDDING_MODEL`, used through the provider named in `provider` (default `localAI`)
- **MinIO source:** the MinIO env vars
- **Extraction:** the OCR settings

## Errors

| Status | Message                                                                                                                    | Cause / fix                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 400    | `Invalid input: body,fileId fileId is required when source is minio or localStorage` (and the same for `url` or `content`) | Missing field for the chosen source                                                                        |
| 400    | `Invalid input: body,source Invalid enum value…`                                                                           | Unknown source                                                                                             |
| 404    | `No documents found to ingest`                                                                                             | CSV with only a header row                                                                                 |
| 415    | `Cannot ingest "<name>": .<ext> files are not supported. …`                                                                | Unsupported file type                                                                                      |
| 500    | `Failed to ingest: File <id> not found in bucket <b>` / `… in local storage`                                               | Wrong id, or the file is missing                                                                           |
| 500    | `Failed to ingest: No extractable text found in "<name>".`                                                                 | Empty extraction. It should be 4xx but is reported as a generic error                                      |
| 500    | `Failed to ingest: ENOENT … data.json`                                                                                     | `source: json` without a `data.json` file                                                                  |
| 500    | `Failed to ingest: URL <u> returned status <n>` / `fetch failed`                                                           | URL source unreachable                                                                                     |
| 500    | `Failed to ingest: No OpenAI-compatible model instance registered for provider: X`                                         | Bad `provider`                                                                                             |
| 500    | `Failed to ingest: <embedding error>`                                                                                      | Embedding provider down, or the model isn't available                                                      |
| 500    | `Failed to ingest: <Chroma error>`                                                                                         | Chroma unreachable, or an embedding dimension mismatch with the existing collection                        |
| 500    | `Failed to ingest: Cannot find package '@chroma-core/default-embed'`                                                       | The collection is created without an embedding function, so chromadb loads this package. Keep it installed |
| 500    | `Failed to search: …`                                                                                                      | Chroma or the embedding provider is down; dimension mismatch (see Known issues)                            |
| 500    | `Failed to remove document from vector store: …`                                                                           | Chroma down. The MinIO flag update needs Redis                                                             |
| 500    | `Failed to clear collection: …` / `Failed to get stats: …` / `Failed to store text: …`                                     | Chroma, Redis or Mongo down                                                                                |

## Known issues

- **Search always embeds with the default provider** (`localAI`). If the documents were ingested with a different `provider`, the dimensions can differ and search fails.
- **`force` doesn't do what its description says.** There is no "already ingested" check to skip. `force` only resets the MinIO `ingested` flag before marking it again.
- **`score` is a Chroma distance**, so lower means more similar.
- **The `url` source can reach internal hosts (SSRF).** It fetches any URL from the server.
- **The CSV loader splits on commas**, so quoted fields that contain commas break into extra columns.
- **Deleting one document loads every chunk id.** `deleteByDocId` fetches all ids in the collection to filter by prefix, which is O(collection size).
- **No per-user scoping.** Every search sees every document.
- **Shared `ingested` flag.** It writes the same `LocalFileModel.ingested` flag as the Qdrant pipeline, so the chat UI can't tell which store a file is in.
