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
 OPENROUTER_CHAT_MODEL: str({ default: 'google/gemma-4-26b-a4b-it:free', desc: 'Default chat/completions model for OpenRouter' }),
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

 // Qdrant / LlamaIndex
 QDRANT_URL: url({ default: 'http://localhost:6333', desc: 'Base URL for the Qdrant vector store' }),
 QDRANT_API_KEY: str({ default: '', desc: 'API key for the Qdrant vector store (optional for local instances)' }),
 QDRANT_COLLECTION_NAME: str({
  default: 'llama_index_documents',
  desc: 'Qdrant collection used by the LlamaIndex ingest/query routes',
 }),
});
