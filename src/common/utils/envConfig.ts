import dotenv from 'dotenv';
import { bool, cleanEnv, host, num, port, str, testOnly, url } from 'envalid';

dotenv.config();

export const env = cleanEnv(process.env, {
 // App
 NODE_ENV: str({ devDefault: testOnly('test'), choices: ['development', 'production', 'test'] }),
 ENV: str(),
 HOST: host({ devDefault: testOnly('localhost') }),
 PORT: port({ devDefault: testOnly(3000) }),
 BASE_URL: str({ devDefault: testOnly('http://localhost:2020') }),
 CORS_ORIGIN: str({ devDefault: testOnly('http://localhost:2020') }),
 API_VERSION: str(),
 CLIENT_ID: str(),

 // Rate limiting
 COMMON_RATE_LIMIT_MAX_REQUESTS: num({ devDefault: testOnly(1000) }),
 COMMON_RATE_LIMIT_WINDOW_MS: num({ devDefault: testOnly(1000) }),

 // Redis
 REDIS_HOST: str(),
 REDIS_PORT: num(),
 ENABLE_REDIS: bool({ default: false, desc: 'Enable Redis' }),

 // MinIO
 ENABLE_MINIO: bool({ default: false, desc: 'Enable MinIO' }),

 // Kafka
 KAFKA_BROKER: str(),

 // Mongo
 MONGO_URI_LOCAL: str(),
 MONGO_URI_TESTS_LOCAL: str(),
 MONGO_URI: str(),
 MONGO_URI_TESTS: str(),

 // Slack
 SLACK_TOKEN: str(),
 SLACK_CHANNEL: str(),
 ENABLE_SLACK_LOGGING: bool({ default: false }),

 // Logging
 ENABLE_FILE_LOGGING: bool({ default: false }),

 // Products API
 PRODUCTS_API: url(),

 // YouTube
 YOUTUBE_API_KEY: str({ default: '', desc: 'API key for the YouTube Data API v3 (goal-tracker course search)' }),

 // OpenAI
 OPENAI_API_KEY: str(),

 // Vision (image analysis)
 VISION_BASE_URL: url({
  default: 'https://openrouter.ai/api/v1',
  desc: 'Base URL for the image analysis (vision) OpenAI-compatible provider',
 }),
 VISION_API_KEY: str({ default: '', desc: 'API key for the vision provider (falls back to OPENAI_API_KEY)' }),

 // AI models (generic)
 AI_MODELS: str({ default: 'ai/gemma3', desc: 'Comma-separated list of AI models' }),

 // LocalAI
 LOCALAI_URL: str({ default: 'http://localhost:8000/v1', desc: 'URL for the LocalAI API' }),
 LOCALAI_CHAT_MODEL: str({ default: 'ai/gemma3', desc: 'Default chat/completions model for LocalAI' }),
 LOCALAI_EMBDED_MODEL: str({ default: 'nemotron-3-embed-1b-q4', desc: 'Embedding model' }),
 LOCALAI_EMBEDDING_MODEL: str({ default: 'nemotron-3-embed-1b-q4', desc: 'Embedding model (canonical name)' }),
 LOCALAI_SUMMARY_MODEL: str({ default: 'lfm2.5-1.2b-instruct', desc: 'Summary model' }),
 LOCALAI_RELEVANCE_MODEL: str({ default: 'lfm2.5-1.2b-instruct', desc: 'History check model' }),
 LOCALAI_IMAGE_ANALYSIS_MODEL: str({ default: 'gemma-4-26b-a4b-it-apex-i-quality', desc: 'Image analysis model' }),

 // OpenRouter
 OPENROUTER_BASE_URL: url({ default: 'https://openrouter.ai/api/v1', desc: 'Base URL for the OpenRouter API' }),
 OPENROUTER_API_KEY: str({ default: '', desc: 'API key for the OpenRouter API' }),
 OPENROUTER_CHAT_MODEL: str({
  default: 'google/gemma-4-26b-a4b-it:free',
  desc: 'Default chat/completions model for OpenRouter',
 }),
 OPENROUTER_VISION_MODEL: str({ default: 'google/gemma-4-26b-a4b-it:free', desc: 'Image analysis model' }),
 OPENROUTER_EMBED_MODEL: str({ default: 'text-embedding-3-small', desc: 'Embedding model for OpenRouter' }),

 // Ollama
 OLLAMA_URL: str({ default: 'http://localhost:11434', desc: 'Base URL for the Ollama OpenAI-compatible API' }),
 OLLAMA_CHAT_MODEL: str({ default: 'qwen2.5:0.5b', desc: 'Default chat/completions model for Ollama' }),

 // Chroma / RAG
 CHROMA_URL: url({ default: 'http://localhost:8000', desc: 'Base URL for the ChromaDB vector store' }),
 RAG_COLLECTION_NAME: str({ default: 'knowledge_base2', desc: 'ChromaDB collection used by the RAG system' }),
 RAG_ENABLED: bool({ default: false, desc: 'Master switch for RAG retrieval in chat' }),
 RAG_TOP_K: num({ default: 3, desc: 'Number of chunks retrieved per query' }),
 OCR_ENABLED: bool({ default: true, desc: 'OCR images and scanned (image-only) PDFs during RAG ingestion' }),
 OCR_LANGS: str({ default: 'eng', desc: 'Tesseract language codes joined with "+", e.g. "eng+ara"' }),

 // Chat history compaction
 CHAT_HISTORY_COMPACT_THRESHOLD_CHARS: num({
  default: 12000,
  desc: 'Stored chat history larger than this (total characters) is summarized before the next turn',
 }),
 CHAT_HISTORY_KEEP_RECENT: num({
  default: 6,
  desc: 'Number of most recent chat messages kept verbatim when the history is compacted',
 }),

 // Qdrant / LlamaIndex
 QDRANT_URL: url({ default: 'http://localhost:6333', desc: 'Base URL for the Qdrant vector store' }),
 QDRANT_API_KEY: str({ default: '', desc: 'API key for the Qdrant vector store (optional for local instances)' }),
 QDRANT_COLLECTION_NAME: str({
  default: 'llama_index_documents',
  desc: 'Qdrant collection used by the LlamaIndex ingest/query routes',
 }),

 // LangChain RAG pipeline (/v1/ingest, /v1/retrieve) - see src/rag
 ANTHROPIC_API_KEY: str({ default: '', desc: 'Anthropic API key for the LangChain RAG agents' }),
 VOYAGE_API_KEY: str({ default: '', desc: 'Voyage API key for reranking; leave empty to skip the rerank step' }),
 RAG_ANSWER_MODEL: str({ default: 'claude-opus-5-5', desc: 'Model for the RAG answer agent' }),
 RAG_VERIFIER_MODEL: str({ default: 'claude-opus-5-5', desc: 'Model for the RAG verifier agent' }),
 RAG_VISION_MODEL: str({ default: 'claude-opus-5-5', desc: 'Model for the image and PDF extraction agents' }),
 RAG_UTILITY_MODEL: str({ default: 'claude-opus-5-5', desc: 'Model for the query analyst, grader and table agent' }),
 RAG_EMBEDDING_DIM: num({ default: 1536, desc: 'Vector size of OPENROUTER_EMBED_MODEL, used to create rag_chunks' }),
 RAG_RERANK_MODEL: str({ default: 'rerank-2.5', desc: 'Voyage rerank model' }),
 RAG_QDRANT_COLLECTION: str({ default: 'rag_chunks', desc: 'Qdrant collection owned by the LangChain RAG pipeline' }),
 RAG_CHUNK_CHARS: num({ default: 3200, desc: 'Text chunk size in characters' }),
 RAG_CHUNK_OVERLAP_CHARS: num({ default: 400, desc: 'Text chunk overlap in characters' }),
 RAG_RETRIEVE_K: num({ default: 20, desc: 'Candidates fetched from Qdrant per search query' }),
 RAG_RERANK_TOP_K: num({ default: 8, desc: 'Candidates kept after reranking' }),
 RAG_MAX_ATTEMPTS: num({ default: 3, desc: 'Answer/verify attempts before the retrieval graph abstains' }),
 RAG_MAX_UPLOAD_MB: num({ default: 50, desc: 'Per-file upload limit for /v1/ingest' }),
 RAG_IMAGE_MAX_EDGE: num({ default: 2000, desc: 'Images are resized to fit this edge before the image agent' }),
 RAG_PDF_EXTRACT_MODE: str({ default: 'vision', choices: ['vision', 'text'], desc: 'How PDFs are read' }),
 RAG_PDF_PAGES_PER_CALL: num({ default: 5, desc: 'PDF pages sent to the extraction agent per model call' }),
 RAG_WORKER_CONCURRENCY: num({ default: 2, desc: 'Ingestion jobs run at once by the worker' }),
 RAG_JOB_LOCK_TIMEOUT_MS: num({ default: 900000, desc: 'A running job older than this can be claimed again' }),
 RAG_MAX_JOB_ATTEMPTS: num({ default: 3, desc: 'Attempts before an ingestion job is marked failed' }),
 RAG_LOG_RETENTION_DAYS: num({ default: 180, desc: 'TTL for rag_request_logs / rag_error_logs; 0 keeps forever' }),
 RAG_LOG_STORE_ANSWERS: bool({ default: true, desc: 'Store answer text in rag_request_logs' }),
 RAG_ALLOW_SHARED_ACL: bool({
  default: false,
  desc: 'Let callers share ingested content with "*" or other users; off until callers are authenticated',
 }),
 RAG_RETRIEVE_TIMEOUT_MS: num({ default: 120000, desc: 'Deadline for one /v1/retrieve request' }),
});
