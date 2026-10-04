import { env } from '@/common/utils/envConfig';

/** Settings for the LangChain RAG pipeline, read once from the validated env. */
export const config = {
 anthropicApiKey: env.ANTHROPIC_API_KEY,
 voyageApiKey: env.VOYAGE_API_KEY,
 models: {
  answer: env.RAG_ANSWER_MODEL,
  verifier: env.RAG_VERIFIER_MODEL,
  vision: env.RAG_VISION_MODEL,
  utility: env.RAG_UTILITY_MODEL,
 },
 embeddingDim: env.RAG_EMBEDDING_DIM,
 rerankModel: env.RAG_RERANK_MODEL,
 qdrantCollection: env.RAG_QDRANT_COLLECTION,
 chunkChars: env.RAG_CHUNK_CHARS,
 chunkOverlapChars: env.RAG_CHUNK_OVERLAP_CHARS,
 retrieveK: env.RAG_RETRIEVE_K,
 rerankTopK: env.RAG_RERANK_TOP_K,
 maxAttempts: env.RAG_MAX_ATTEMPTS,
 maxUploadMb: env.RAG_MAX_UPLOAD_MB,
 imageMaxEdge: env.RAG_IMAGE_MAX_EDGE,
 pdfExtractMode: env.RAG_PDF_EXTRACT_MODE as 'vision' | 'text',
 pdfPagesPerCall: env.RAG_PDF_PAGES_PER_CALL,
 workerConcurrency: env.RAG_WORKER_CONCURRENCY,
 jobLockTimeoutMs: env.RAG_JOB_LOCK_TIMEOUT_MS,
 maxJobAttempts: env.RAG_MAX_JOB_ATTEMPTS,
 logRetentionDays: env.RAG_LOG_RETENTION_DAYS,
 logStoreAnswers: env.RAG_LOG_STORE_ANSWERS,
 allowSharedAcl: env.RAG_ALLOW_SHARED_ACL,
 retrieveTimeoutMs: env.RAG_RETRIEVE_TIMEOUT_MS,
 /** First retry delay for a requeued job; doubles per attempt up to the cap. */
 jobBackoffBaseMs: 30_000,
 jobBackoffMaxMs: 600_000,
 /** Each image and each table costs one model call, so a document may not carry more than this many. */
 maxImagesPerDoc: 200,
 maxTablesPerDoc: 200,
 /** Upper bound on the source text sent to the retrieval agents in one request. */
 maxContextChars: 400_000,
 /** Declared uncompressed size and entry count allowed in a DOCX/PPTX/XLSX container. */
 maxZipBytes: 200 * 1024 * 1024,
 maxZipEntries: 5_000,
 /** Model calls made at once inside one ingestion node, to stay within rate limits. */
 agentConcurrency: 4,
 /** A parent is stored in one MongoDB document (16 MB limit), so long sections are split. */
 maxParentChars: 200_000,
 /** In vision mode every page costs a model call, so very long PDFs are refused rather than silently truncated. */
 maxPdfPages: 500,
 /** Tables longer than this are stored by row group; each group shares the one table-level summary. */
 tableRowGroup: 200,
};
