# File storage: local disk, the fs-util wrapper, and MinIO

## What it does

The app has three upload APIs:

| API                | Stores bytes in                            | Stores metadata in                                       | Used by                                                                         |
| ------------------ | ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/v1/localStorage` | `./localStorage/<folder>/<uuid>-<name>`    | Mongo `localFiles` (`LocalFileModel`)                    | The fs-util wrapper; both RAG pipelines (`/ingest/:id`, `source: localStorage`) |
| `/v1/fs-util`      | (forwards to `/v1/localStorage` over HTTP) | same                                                     | **The chat UI**: attachment uploads and the RAG files panel                     |
| `/v1/minio`        | MinIO bucket (default `uploads`)           | **Redis** (`fileReference:<id>` plus a sorted-set index) | Chroma `source: minio`; the chatbot's attachment lookup                         |

`fs-util` is a facade. `fileStorageService.ts` is the only file that knows the backend is `/v1/localStorage`, so the backend can be swapped later.

## Code

| File                                                                      | Role                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/api/localStorage/localStorageRouter.ts` / `localStorageService.ts`   | Disk plus Mongo                                                                 |
| `src/api/fileStorage/fileStorageRouter.ts` / `fileStorageService.ts`      | Wrapper that calls `http://localhost:${PORT}/v1/localStorage`                   |
| `src/api/minio/minioRouter.ts` / `minioService.ts` / `minioRepository.ts` | MinIO plus Redis index                                                          |
| `src/services/minio.ts`                                                   | MinIO client (created at import), `initMinio`                                   |
| `src/models/localFile.model.ts`                                           | `{ fileId, name, folder, type, size, mimetype, metadata, ingested, createdAt }` |

## Endpoints

The same shape exists on each base path: `/v1/localStorage`, `/v1/fs-util` and `/v1/minio`.

| Method | Path               | Input                                                                                                                 | Success                                                                                   |
| ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| POST   | `/upload`          | multipart `file`; localStorage and fs-util also take `folder`, `type`, `metadata` (JSON string); MinIO takes `bucket` | `{ id, url, name }`                                                                       |
| POST   | `/upload/multiple` | multipart `files` (max 10)                                                                                            | `[{ id, url, name }]`                                                                     |
| GET    | `/files`           | —                                                                                                                     | List of files (localStorage and fs-util include `folder`, `type`, `metadata`, `ingested`) |
| GET    | `/:id`             | MinIO: `?bucket=`                                                                                                     | The file bytes, streamed                                                                  |
| DELETE | `/:id`             | —                                                                                                                     | `true`                                                                                    |
| DELETE | `/all`             | localStorage and fs-util: `?folder=`; MinIO: `?bucket=`                                                               | Number of files deleted                                                                   |

The `url` returned by each API is:

- localStorage: `/v1/localStorage/<id>`
- fs-util: `/v1/fs-util/<id>`
- MinIO: `http://<MINIO_ENDPOINT>:<MINIO_PORT>/<bucket>/<name>`, a direct public-read URL

## Configuration

These are read raw from `process.env`, not validated:

- `LOCAL_STORAGE_DIR` (default `localStorage`), `LOCAL_STORAGE_FOLDER` (default `uploads`)
- `MAX_FILE_SIZE` (default 10485760)
- `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`

`ENABLE_MINIO` only controls `initMinio()` at boot, and even that only runs when `ENABLE_REDIS` is on (see [platform.md](platform.md)).

## Errors

| Status                                                      | Message                                                                                                             | Cause / fix                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400                                                         | `No file provided` / `No files provided`                                                                            | Wrong multipart field (`file` or `files`), or empty                                                                                                                                                             |
| **500**                                                     | `Internal Server Error`                                                                                             | File over `MAX_FILE_SIZE`, or more than 10 files. Multer errors aren't caught by these routers, so they reach the global handler as 500 instead of 413                                                          |
| 500                                                         | `Failed to upload file to local storage: <fs/Mongo error>`                                                          | Disk not writable (`EACCES`), disk full, Mongo down                                                                                                                                                             |
| 404                                                         | `{ "error": "File not found" }` (**not** a `ServiceResponse`)                                                       | `GET /:id` with an unknown id, or a DB record whose file is missing on disk                                                                                                                                     |
| 404                                                         | `File not found`                                                                                                    | `DELETE /:id` with an unknown id                                                                                                                                                                                |
| 500                                                         | `Failed to list files: …` / `Failed to delete …`                                                                    | Mongo, disk or MinIO errors                                                                                                                                                                                     |
| fs-util: same status as the backend                         | The backend's `message` is passed through                                                                           | The wrapper forwards the local-storage error                                                                                                                                                                    |
| fs-util 500                                                 | `Failed to upload file` (etc.)                                                                                      | The internal HTTP call itself failed, e.g. `ECONNREFUSED` if `PORT` differs from the port actually served, or TLS or proxy issues                                                                               |
| fs-util **429**                                             | `Too many requests…`                                                                                                | Every fs-util call makes a second request to the same server, which also counts against the rate limit                                                                                                          |
| MinIO 500                                                   | `Failed to upload file to Minio: <msg> "<stack>"`                                                                   | MinIO unreachable or bad credentials. The stack trace is included in the response                                                                                                                               |
| MinIO: list returns `[]` / upload succeeds but isn't listed | Redis is down. `minioRepository` swallows Redis errors (`Cannot list file references`, `Cannot add file reference`) | Enable Redis                                                                                                                                                                                                    |
| MinIO 500                                                   | `Failed to delete file from Minio: The client is closed`                                                            | Redis is down. Unlike the other repository methods, `deleteByIdAsync` doesn't swallow Redis errors. The object has **already been removed** from MinIO when this fails, so the Redis reference is left dangling |
| Boot crash                                                  | `InvalidEndpointError: Invalid endPoint : undefined`                                                                | `MINIO_ENDPOINT` unset. The client is built at import even when MinIO is disabled                                                                                                                               |
| Log only                                                    | `Failed to set public read policy on bucket …`                                                                      | MinIO policy call rejected                                                                                                                                                                                      |

## Known issues

- **Path traversal** (`localStorageService.ts:52-57`). `folder` from the request body and the uploaded file's `originalname` are joined into the disk path without sanitising, so `../` can write outside `localStorage/`.
- **No ownership.** `GET /files` lists every user's files, and any caller can delete any id.
- **MinIO `DELETE /all` removes every Redis reference**, including references for other buckets, even when `?bucket=` is given.
- **MinIO lookups list objects one by one.** `getFile` and `deleteFile` list objects by prefix, or the whole bucket for delete, instead of fetching by key.
- **Delete doesn't clean up RAG.** Deleting a file doesn't remove its vectors from Qdrant or Chroma. The chat UI tries this itself, best-effort, for single deletes, but not for "delete all".
- **Two stores, one feature.** Chat attachments are uploaded through fs-util but read from MinIO by the chatbot (see [chat-websocket.md](chat-websocket.md)).
