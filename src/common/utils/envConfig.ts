import dotenv from 'dotenv';
import { cleanEnv, host, num, port, str, testOnly, url } from 'envalid';

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
 SLACK_CHANNEL: str(),
});
