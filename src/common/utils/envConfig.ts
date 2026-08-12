import dotenv from 'dotenv';
import { bool, cleanEnv, host, num, port, str, testOnly, url } from 'envalid';

dotenv.config();

export const env = cleanEnv(process.env, {
 NODE_ENV: str({ devDefault: testOnly('test'), choices: ['development', 'production', 'test'] }),
 HOST: host({ devDefault: testOnly('localhost') }),
 PORT: port({ devDefault: testOnly(3000) }),
 CORS_ORIGIN: str({ devDefault: testOnly('http://localhost:2020') }),
 COMMON_RATE_LIMIT_MAX_REQUESTS: num({ devDefault: testOnly(1000) }),
 COMMON_RATE_LIMIT_WINDOW_MS: num({ devDefault: testOnly(1000) }),
 REDIS_HOST: str(),
 REDIS_PORT: num(),
 KAFKA_BROKER: str(),
 CLIENT_ID: str(),
 ENV: str(),
 PRODUCTS_API: url(),
 MONGO_URI_LOCAL: str(),
 MONGO_URI_TESTS_LOCAL: str(),
 MONGO_URI: str(),
 MONGO_URI_TESTS: str(),
 SLACK_TOKEN: str(),
 ENABLE_SLACK_LOGGING: bool({ default: false }),
 SLACK_CHANNEL: str(),
 BASE_URL: str({ devDefault: testOnly('http://localhost:2020') }),
 API_VERSION: str(),
 OPENAI_API_KEY: str(),
 ENABLE_FILE_LOGGING: bool({ default: false }),
AI_MODELS: str({ default: 'ai/gemma3', desc: 'Comma-separated list of AI models' }),
EMBDED_MODEL: str({ default: 'nemotron-3-embed-1b-q4', desc: 'Embedding model' }),
SUMMARY_MODEL: str({ default: 'lfm2.5-1.2b-instruct', desc: 'Summary model' }),
RELEVANCE_MODEL: str({ default: 'lfm2.5-1.2b-instruct', desc: 'History check model' }),
IMAGE_ANALYSIS_MODEL: str({ default: 'gemma-4-26b-a4b-it-apex-i-quality', desc: 'Image analysis model' }),
});
