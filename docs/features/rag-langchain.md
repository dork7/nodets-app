# RAG: LangChain multi-agent pipeline (`/v1/ingest`, `/v1/retrieve`)

## What it does

A multimodal RAG pipeline built on LangChain.js and LangGraph. Ingestion parses files (text, tables and images), enriches them with Claude, and indexes them in Qdrant. Retrieval answers a question from the indexed content and passes the answer to a **Verifier agent** before returning it, with citations back to the source file and page. Every request and every error is written to MongoDB.

It is a third pipeline, separate from [rag-llamaindex.md](rag-llamaindex.md) (used by the chatbot) and [rag-chroma.md](rag-chroma.md). It has its own Qdrant collection and MongoDB collections and never touches theirs. The chatbot does not use it.

It implements the plan in `.claude/skills/langchain-rag/SKILL.md`.

**Status (2026-10-04):** written and unit-tested with mocked infrastructure (248 tests). It has **not** been run against a real Qdrant, MongoDB or Claude. See [Known issues](#known-issues) before relying on it.

## Code

Everything is under `src/rag/`. It is mounted by `mountRag(app)` in `src/server.ts`.

| File                                                                                   | Role                                                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `index.ts`                                                                             | `mountRag` / `createRagRouter`: request logger, optional auth, routers, error handler     |
| `config.ts`                                                                            | Settings read from `envConfig.ts`, plus fixed limits                                      |
| `llm.ts`                                                                               | `ChatAnthropic` factory per role and `invokeStructured()`                                 |
| `embeddings.ts`                                                                        | LangChain adapter over the project's `embedModel` (`config/llamaConfig`)                  |
| `graphUtils.ts`                                                                        | `traced()` node wrapper, `RagError`, `HttpError`, `QualityGateError`, `mapLimit`, `newId` |
| `types.ts`                                                                             | `Element`, `Parent`, `Child`, `RagDocument`, `RagJob`, `Source`, `Principal`              |
| `bootstrap.ts`                                                                         | Creates the Qdrant collection, payload indexes and MongoDB indexes                        |
| `api/ingest.router.ts`, `api/retrieve.router.ts`                                       | Routes                                                                                    |
| `api/schemas.ts`                                                                       | Zod request schemas and the OpenAPI registry                                              |
| `api/middleware/requestLogger.ts`, `errorHandler.ts`                                   | `rag_request_logs` and `rag_error_logs` writers                                           |
| `ingestion/intake.ts`                                                                  | Type sniffing, SHA-256, dedupe, GridFS upload, job creation                               |
| `ingestion/parsers/*`                                                                  | One parser per format: PDF, DOCX, PPTX, XLSX/CSV, HTML, Markdown, text                    |
| `ingestion/pdfExtractAgent.ts`                                                         | Claude reads PDF page batches                                                             |
| `ingestion/chunking.ts`, `tableAgent.ts`, `imageAgent.ts`                              | Text chunker, table summaries, image descriptions                                         |
| `ingestion/quality.ts`, `indexer.ts`                                                   | Quality gate; embed and write to Qdrant and MongoDB                                       |
| `ingestion/graph.ts`, `ingestion/worker.ts`                                            | Ingestion graph; the worker process that claims and runs jobs                             |
| `retrieval/graph.ts`, `retrieval/state.ts`                                             | Retrieval graph, routing and the abstain node                                             |
| `retrieval/queryAnalyst.ts`, `retriever.ts`, `grader.ts`, `answerer.ts`, `verifier.ts` | The five retrieval agents                                                                 |
| `stores/qdrant.ts`, `mongo.ts`, `docstore.ts`, `blobs.ts`, `logs.ts`                   | The only modules that touch Qdrant, MongoDB and GridFS                                    |
| `scripts/rag-bootstrap.ts`                                                             | Runs `bootstrapRag()` once                                                                |

Prompts are in `src/config/prompt.ts` (the `RAG_*` constants at the bottom).

## Endpoints

| Method | Path                           | Input                                                                                                                                             | Success                                                    |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| POST   | `/v1/ingest`                   | multipart: `files` (up to 20, ≤ `RAG_MAX_UPLOAD_MB` each), `collection`, `userId`, optional `text`, `textFormat`, `metadata` (JSON), `acl` (JSON) | `202 { jobs: [{ jobId, docId, filename, status }] }`       |
| GET    | `/v1/ingest/:jobId?userId=`    | —                                                                                                                                                 | `{ jobId, docId, status, stage, counts, errorId }`         |
| DELETE | `/v1/documents/:docId?userId=` | —                                                                                                                                                 | `{ deleted: true, docId }`                                 |
| POST   | `/v1/retrieve`                 | JSON `{ question, collection, userId, filters?, topK?, mode? }`                                                                                   | `{ answer, verified, verification, citations, requestId }` |

- **Accepted files:** pdf, docx, pptx, xlsx, csv, html, md, txt, png, jpg, webp, gif, tiff. The type is detected from the file's bytes, not its extension.
- **`userId` is required and client-asserted.** The app has no auth middleware. `mountRag(app, { auth })` accepts one; when it sets `req.user.id`, that id is used instead.
- **`acl`** lists who else may retrieve the content; the uploader's own `user:<userId>` is always included. Entries must be `user:<id>`, `group:<id>` or `*` (at most 50). Sharing with `*` or another user is refused with 403 unless `RAG_ALLOW_SHARED_ACL=true`. A caller matches `user:<userId>` and `*`; nothing matches `group:` entries yet.
- **`metadata`** is a flat JSON object of scalars (at most 30 keys, string values up to 500 characters), because it is copied into every chunk.
- **`filters`** accepts only `docId`, `filename`, `modality` and `page`; other keys are ignored.
- **`mode: "chunks"`** skips the answer and verifier agents and returns the sources as `citations`, with `answer: null`.
- Every response carries an `x-request-id` header.
- A job's `status` goes `queued → running → succeeded | failed`. A failed job carries the `errorId` of its `rag_error_logs` entry.
- When verification fails after all attempts, the response is still `200` with `verified: false` and either the supported claims only or a "could not find a verified answer" message.

## How ingest works

The API only registers the upload; a **separate worker process** does the work.

**In the API (`intake.ts`)**

1. Multer writes each upload to a temp file. `inspectFile` checks every file's type first, so one unsupported file rejects the whole request before anything is stored.
2. The file is hashed. If the same caller already uploaded these bytes to this collection (`collection`, `uploadedBy`, `sha256`), the existing `docId` and its latest job are returned. If that document failed, or has no job, a new job is queued for it.
3. Otherwise the file is streamed into GridFS (`rag_blobs`), and a `rag_documents` row and a `queued` `rag_jobs` row are inserted. If either insert fails, what was already written is rolled back. The temp file is always removed.

**In the worker (`worker.ts`, `ingestion/graph.ts`)**

The worker polls `rag_jobs` every second, claims the oldest queued job atomically, and runs this graph:

1. **parse** — reads the blob and converts it to ordered elements (`text`, `table`, `image`), each with its page and heading path.
2. Three branches run in parallel:
   - **textChunker** — a section is the parent; chunks of `RAG_CHUNK_CHARS` are the children, each prefixed with its heading path. No model call.
   - **tableAgent** — one Claude call per table for a search summary. The raw table is the parent. Tables over 200 rows are stored by row group with the header repeated.
   - **imageAgent** — images are normalised with `sharp`, described by Claude, and saved to GridFS so the verifier can re-read the original.
3. **qualityGate** — fails the job when nothing was extracted, text is mostly non-printable, a chunk is too large to embed, or an image description is empty.
4. **indexer** — deletes anything already stored for the document, writes parents to `rag_parents`, embeds the children and upserts them to Qdrant.

Job handling:

- **Retries:** a failed job is requeued until `RAG_MAX_JOB_ATTEMPTS`, with a backoff of 30 seconds that doubles per attempt (capped at 10 minutes). Quality-gate failures and a missing `ANTHROPIC_API_KEY` are not retried.
- **Lock:** a running job refreshes its lock every third of `RAG_JOB_LOCK_TIMEOUT_MS`. Only a job whose lock has gone stale (its worker died) can be claimed again.
- **Ownership:** only the worker holding a job may record its outcome or write to the index. A run that lost its lock writes nothing.
- **Reaper:** a job left `running` by a worker that died on its last attempt is marked `failed` by the next idle worker.
- **Deletes:** if the document is deleted while its job runs, the indexer notices, removes anything it wrote and abandons the job.
- **Budgets:** a document with more than 200 images or 200 tables, or an Office file that would inflate past 200 MB or 5,000 entries, is refused before any model call. The same image repeated in a document is described once. An image that cannot be decoded is skipped.

**PDFs.** With `RAG_PDF_EXTRACT_MODE=vision` (default), batches of `RAG_PDF_PAGES_PER_CALL` pages are sent to Claude, which returns text blocks, tables as Markdown and figure descriptions. Where a page has a text layer and Claude's reading covers less than 90% of its words, the text layer replaces that page's text. A batch whose output is cut off is halved and retried. PDFs over 500 pages are refused. With `text` mode only the text layer is used: no tables, figures or scanned pages.

**Images in Markdown and HTML** are read only from data URIs. Remote URLs are never fetched.

## How retrieval works (`retrieval/graph.ts`)

```
analyst → retriever → grader → answerer → verifier → response
   ▲                     │         │          │
   └──── nothing relevant / not found / insufficient context
                                   ▲          │
                                   └── unsupported claims
```

1. **analyst** — rewrites the question into 1–4 search queries, may infer a `modality` filter, and can decide no retrieval is needed.
2. **retriever** — searches Qdrant per query, filtered by `collection`, the caller's ACL and the allowed filters. The hits of all queries are merged by score, reranked through Voyage when `VOYAGE_API_KEY` is set (if Voyage fails, the similarity order is kept), and each chunk is swapped for its parent, numbered `S1…Sn`. Source text sent to the agents is capped at 400,000 characters per request. No model call.
3. **grader** — one call that drops sources not relevant to the question.
4. **answerer** — answers only from the numbered sources, citing `[S1]`. Cited ids are parsed from the text in code.
5. **verifier** — checks citation ids in code first, then asks Claude to list each claim with an exact supporting quote. Image sources are sent as the original image. The verdict is **recomputed in code** (`finalise`): a claim whose quote is not found in its source is unsupported.

Routing on the result:

| Outcome                                                        | Next step                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `supported`                                                    | Return, `verified: true`                                                  |
| Unsupported claims                                             | Back to the answerer with the feedback                                    |
| Insufficient context, off-topic, or the answerer found nothing | Back to the analyst; wider search, inferred filter dropped                |
| `RAG_MAX_ATTEMPTS` reached                                     | Abstain: supported claims only, or a not-found message; `verified: false` |

Both loops count against one `attempts` counter, so every request terminates. A worst-case request makes about 12 Claude calls. The request is abandoned with 504 after `RAG_RETRIEVE_TIMEOUT_MS`, and the graph stops if the client disconnects.

## Storage

| Store                      | Holds                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Qdrant `rag_chunks`        | Embedded search text and metadata (`docId`, `parentId`, `collection`, `acl`, `modality`, `filename`, `page`) |
| MongoDB `rag_documents`    | One row per upload: hash, status, ACL, uploader                                                              |
| MongoDB `rag_parents`      | The raw content each vector points to                                                                        |
| MongoDB `rag_jobs`         | The ingestion queue and job status                                                                           |
| GridFS `rag_blobs`         | Original uploads and normalised images                                                                       |
| MongoDB `rag_request_logs` | One document per request, written when the response closes                                                   |
| MongoDB `rag_error_logs`   | One document per 5xx or failed job, linked by `requestId` / `jobId`                                          |

The Qdrant client is the existing one, taken from `getQdrantVectorStore().client()`. Logs expire after `RAG_LOG_RETENTION_DAYS`. The worker creates the indexes when it starts, so `rag:bootstrap` is only needed where no worker runs.

## Configuration

- **Reused:** `QDRANT_URL`, `QDRANT_API_KEY`, `MONGO_URI`, and `OPENROUTER_API_KEY` / `OPENROUTER_EMBED_MODEL` for embeddings.
- **Models:** `ANTHROPIC_API_KEY`; `RAG_ANSWER_MODEL`, `RAG_VERIFIER_MODEL`, `RAG_VISION_MODEL`, `RAG_UTILITY_MODEL` (all default `claude-opus-5-5`).
- **Reranking:** `VOYAGE_API_KEY` (optional), `RAG_RERANK_MODEL`.
- **Index:** `RAG_QDRANT_COLLECTION` (`rag_chunks`), `RAG_EMBEDDING_DIM` (1536; must match the embedding model).
- **Chunking and retrieval:** `RAG_CHUNK_CHARS`, `RAG_CHUNK_OVERLAP_CHARS`, `RAG_RETRIEVE_K`, `RAG_RERANK_TOP_K`, `RAG_MAX_ATTEMPTS`.
- **Uploads and PDFs:** `RAG_MAX_UPLOAD_MB`, `RAG_IMAGE_MAX_EDGE`, `RAG_PDF_EXTRACT_MODE`, `RAG_PDF_PAGES_PER_CALL`.
- **Worker:** `RAG_WORKER_CONCURRENCY`, `RAG_JOB_LOCK_TIMEOUT_MS`, `RAG_MAX_JOB_ATTEMPTS`.
- **Logs:** `RAG_LOG_RETENTION_DAYS`, `RAG_LOG_STORE_ANSWERS`.
- **Access and limits:** `RAG_ALLOW_SHARED_ACL` (default `false`), `RAG_RETRIEVE_TIMEOUT_MS` (default 120000).

`RAG_COLLECTION_NAME`, `RAG_ENABLED` and `RAG_TOP_K` belong to the older pipelines, not this one.

## Running it

```bash
npm run rag:bootstrap   # once: Qdrant collection, payload indexes, MongoDB indexes
npm run dev             # the API
npm run rag:worker      # a second process; without it, jobs stay "queued"
```

Document content is sent to Anthropic (PDF pages, images, tables, retrieved sources), to OpenRouter (every chunk and query, for embeddings) and, when a key is set, to Voyage.

## Errors

Errors use this pipeline's own shape, **not** `ServiceResponse`:

```json
{ "error": { "code": "invalid_request", "message": "Invalid request", "requestId": "req_…", "errorId": null } }
```

`errorId` is set for 5xx responses and points at the `rag_error_logs` document.

| Status                 | `code`                  | Cause / fix                                                                                                                                                                                         |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400                    | `invalid_request`       | A field fails its schema (missing `collection`, `userId` or `question`; `metadata` / `acl` not valid JSON). `details` lists the issues                                                              |
| 400                    | `empty_request`         | `/v1/ingest` with neither a file nor `text`                                                                                                                                                         |
| 400                    | `invalid_upload`        | A Multer error other than size, e.g. more than 20 files or a wrong field name                                                                                                                       |
| 413                    | `payload_too_large`     | A file over `RAG_MAX_UPLOAD_MB`, or a text field over 1 MB                                                                                                                                          |
| 415                    | `unsupported_file_type` | A file whose bytes are not an allowed type. Nothing from the request is stored                                                                                                                      |
| 404                    | `not_found`             | Unknown job or document, or one uploaded by a different `userId`                                                                                                                                    |
| 401                    | `unauthorized`          | An auth middleware is mounted but did not identify the caller                                                                                                                                       |
| 403                    | `acl_not_allowed`       | `acl` names `*` or another user while `RAG_ALLOW_SHARED_ACL` is false                                                                                                                               |
| 504                    | `retrieve_timeout`      | `/v1/retrieve` exceeded `RAG_RETRIEVE_TIMEOUT_MS`, or the client disconnected                                                                                                                       |
| 503                    | `llm_not_configured`    | `ANTHROPIC_API_KEY` is empty. Set it and restart                                                                                                                                                    |
| 500                    | `internal_error`        | Anything else: Qdrant or MongoDB unreachable, an embedding or rerank failure, a model refusal or truncated output. Look up `errorId` in `rag_error_logs`; `stage` names the node that failed        |
| 200, `verified: false` | —                       | Not an error: the answer could not be verified within `RAG_MAX_ATTEMPTS`                                                                                                                            |
| Job `failed`           | —                       | See the job's `errorId`. Common causes: the quality gate rejected the extraction, an encrypted or corrupt PDF, a PDF over 500 pages, an embedding dimension that does not match `RAG_EMBEDDING_DIM` |
| Job stays `queued`     | —                       | The worker is not running                                                                                                                                                                           |

Malformed JSON sent to `/v1/retrieve` is rejected by the app's own body parser, so it returns the app's `ServiceResponse` error and is not logged here.

## Known issues

The code, security and architecture reviews of 2026-10-04 raised a list of defects. Most were fixed the same day (job locking and retries, delete races, blob cleanup, per-uploader dedupe, ACL validation, upload and parsing limits, structured-output parsing, multi-query merging, stale retry state, heading paths, PPTX number coercion, verifier evidence checks, request-log contents). What remains:

**Never run end to end.** The model calls, Qdrant writes and searches, GridFS and the worker loop are untested against real services. The fixes above are covered by unit tests with mocked infrastructure only.

**Access control**

- `userId` is client-asserted, so any caller can act as any user, including reading and deleting that user's documents. Real authentication has to be passed to `mountRag(app, { auth })`.
- `group:` ACL entries are accepted but no caller ever matches them.
- There are no per-user rate limits or quotas; the app's global per-IP limiter is the only bound on paid model calls.

**Worker**

- The Docker image starts only the API, so no worker runs there. There is no in-process worker mode and no production (`node dist/...`) worker script.
- Parsing runs in the worker's own thread with no timeout. A file that is slow to parse blocks that worker; a file that exhausts memory kills it.
- On SIGTERM the worker waits for running jobs and does not release their locks early.

**Retrieval and verification**

- `verified: true` is a quality signal, not a security boundary: only the claims the verifier model lists are checked, and claims attributed to an image source that was re-read are not string-matched.
- A parent is a whole section, so one very large section can use most of the context budget.
- Every row group of a large table is embedded with the same table-level summary, so search cannot tell which group holds a given row.
- Malformed JSON sent to `/v1/retrieve` is handled by the app's body parser, not this pipeline's error handler.

**Operations**

- Ingestion model calls record no token usage, and nothing reaches `/v1/monitor`.
- Changing `RAG_LOG_RETENTION_DAYS` after the indexes exist fails on an index-options conflict; the TTL index must be dropped by hand first.
- A retry after an embedding failure repeats every model call for that document.
- When one file of a multi-file upload fails after the type check, the request returns an error although the other files were registered.

**Not built:** the eval set, hybrid search, real authentication and group ACLs, a re-ingest endpoint, a worker health endpoint.
