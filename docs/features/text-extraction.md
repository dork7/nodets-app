# Text extraction and OCR (`extractText`)

## What it does

`extractText(buffer, filename)` turns an uploaded file into plain text, choosing the method from the file extension. Three callers share it:

- the Qdrant RAG pipeline (`llamaIndexService`)
- the Chroma RAG pipeline (`loaders.ts`)
- chat file attachments (`imageHandler.getFileText`)

Its whitelist decides what any of them can ingest.

## Code

`src/api/rag/extractText.ts`. Tests are in `src/api/rag/__tests__/extractText.test.ts` (46 tests).

## Supported types

| Type         | Extensions                                                                                                                | Method                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| PDF          | `pdf`                                                                                                                     | `pdf-parse` text layer, page by page; OCR is added where needed (below) |
| Word         | `docx`                                                                                                                    | `mammoth.extractRawText`                                                |
| Images       | `png jpg jpeg webp bmp gif tif tiff pbm`                                                                                  | Tesseract OCR, **only when `OCR_ENABLED=true`**                         |
| Text         | `txt md csv tsv json jsonl log html xml svg yaml toml ini env js ts py java go rs sql …` (full list in `TEXT_EXTENSIONS`) | UTF-8 decode                                                            |
| No extension | —                                                                                                                         | UTF-8 decode if the first 8KB contain no NUL byte                       |

Anything else throws `UnsupportedFileTypeError`.

## PDF handling

Each page is handled on its own:

- **Pages with a text layer** keep their text. Embedded images on those pages that are **larger than 100px** in both width and height (`PDF_IMAGE_MIN_SIZE`) are also OCR'd, and the OCR text is added after the page's text.
- **Pages without a text layer** (scanned) are rendered at 2× scale (`PDF_OCR_SCALE`) and OCR'd.
- **With `OCR_ENABLED=false`,** only the text layer is used.

The `-- N of M --` page markers that `pdf-parse` adds to the joined text never appear in the output, because pages are read one by one. All images in a document are OCR'd with one Tesseract worker, which is terminated afterwards.

## Configuration

| Variable      | Default | Meaning                                             |
| ------------- | ------- | --------------------------------------------------- |
| `OCR_ENABLED` | `true`  | Enables image OCR and PDF OCR                       |
| `OCR_LANGS`   | `eng`   | Tesseract languages joined with `+`, e.g. `eng+ara` |

**Runtime network requirement:** the first time OCR runs, Tesseract downloads `<lang>.traineddata` from `cdn.jsdelivr.net` and caches it in the process's working directory (gitignored as `*.traineddata`).

## Errors

| Error                                                                                                    | Cause                                                                                                                                                                                                            | How callers surface it                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UnsupportedFileTypeError`: `Cannot ingest "<name>": .<ext> files are not supported. Supported types: …` | Extension isn't whitelisted, or it is an image with OCR disabled                                                                                                                                                 | Chroma: **415**. Qdrant: **500**. Chat: attachment dropped                                                                                           |
| `Cannot ingest "<name>": the file looks binary, not text.`                                               | A NUL byte in the first 8KB of a file with a text extension                                                                                                                                                      | 500 / attachment dropped                                                                                                                             |
| Empty string (not an error)                                                                              | Blank document, or scanned PDF / image with OCR off                                                                                                                                                              | Qdrant: 400 `No extractable text found`. Chroma: 500 with the same text                                                                              |
| **Hangs forever**                                                                                        | Tesseract can't load language data: offline, CDN blocked, CDN outage, or an invalid code in `OCR_LANGS` (e.g. `eng+arb`). `createWorker` raises an uncaught exception and its promise never settles (reproduced) | The HTTP request or chat turn never responds. The worker thread leaks. The log shows `uncaughtException … Network error while fetching …traineddata` |
| `Error attempting to read image.`                                                                        | A corrupt or unsupported image reaches Tesseract                                                                                                                                                                 | The **whole** file fails, even PDF pages that had a text layer                                                                                       |
| mammoth errors (e.g. `Can't find end of central directory`)                                              | Corrupt `.docx`                                                                                                                                                                                                  | 500 / attachment dropped                                                                                                                             |
| pdf-parse errors (`Invalid PDF structure`, password errors)                                              | Corrupt or encrypted PDF                                                                                                                                                                                         | 500 / attachment dropped                                                                                                                             |

## Known issues (from the code review of the OCR change)

- **No timeout on OCR.** The hang above has no bound. Mitigations: set `OCR_ENABLED=false` on servers without CDN access, or pre-place the `.traineddata` files.
- **No fallback to the text layer.** An OCR failure on one image fails the whole PDF.
- **No limits on OCR work.** There is no page cap and no time cap. All rendered pages and images are held in memory before OCR starts, and a new worker is created per call, with no concurrency limit. The 10MB upload limit caps bytes, not pages.
- **Searchable scans are OCR'd twice.** A scan with a hidden text layer has its full-page image OCR'd again, which duplicates the text. A logo reused on every page is OCR'd once per page.
- **Callers truncate after the work is done.** They cut to 50,000 characters only after the whole document has been extracted.
