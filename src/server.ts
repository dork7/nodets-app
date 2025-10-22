import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Express } from 'express';
import { graphqlHTTP } from 'express-graphql';
import helmet from 'helmet';
import path from 'path';
import { pino } from 'pino';

import apis from '@/api';
import { openAPIRouter } from '@/api-docs/openAPIRouter';
import errorHandler from '@/common/middleware/errorHandler';
import rateLimiter from '@/common/middleware/rateLimiter';
import requestLogger from '@/common/middleware/requestLogger';
import { env } from '@/common/utils/envConfig';

import { cacheRules } from '../cacheRules';
import { schema } from './api/graphql/schema';
import { cacheHandler } from './common/middleware/cacheHandler';
import { proxyHandler } from './common/middleware/proxy';
import { reqLoggerKafka } from './common/middleware/reqLoggerKafka';
import { readFileData } from './common/utils/fileUtils';
import { sendSlackNotification } from './common/utils/slack';
import { cacheConfig, cacheConfigHandler } from './config/cacheConfig';
import { initKafka } from './config/kafka';
import mongoDB from './config/mongoose';
import { redisClient } from './config/redisStore';
const loggerOriginal = pino({ name: 'server start' });

const logger = new Proxy(loggerOriginal, {
 get: (target, prop, receiver) => {
  const originalValue = Reflect.get(target, prop, receiver);

  // Only wrap functions (logging methods)
  if (typeof originalValue === 'function') {
   return function (...args) {
    // --- Wrapper Logic for Logging Methods ---

    if (prop === 'error' || prop === 'fatal') {
     console.warn(`[Proxy-Alert] A critical ${prop} event is being logged.`);
     sendSlackNotification(`${args[1]} || ${args[0].stack}`, 'ERROR');
    }

    // Call the original function on the target object
    return originalValue.apply(target, args);
   };
  }

  // Return all other properties (e.g., logger.level, logger.child, etc.) as they are
  return originalValue;
 },
});

const app: Express = express();

// Set the application to trust the reverse proxy
app.set('trust proxy', true);

if (env.ENV === 'local') {
 redisClient.connect();
 initKafka().catch((err) => logger.error(err));
 global.cacheHash = cacheConfig.createHash(cacheRules);
 mongoDB();
}

// Middlewares
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(helmet());
app.use(rateLimiter);

// Request logging
app.use(requestLogger);

app.use(express.json());

app.use(
 bodyParser.urlencoded({
  extended: true,
 })
);
app.use(proxyHandler);
app.use(reqLoggerKafka);
app.use(cacheConfigHandler, cacheHandler);
// Routes
app.use('/v1', apis);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

app.get('/dashboard', async function (req, res) {
 const fileContent = await readFileData('file.txt');
 const splitted = fileContent.split('\n');

 const objects = splitted.filter((item) => item.trim() !== '').map((item) => JSON.parse(item));
 const recordCount = objects.length;

 res.render(path.join(__dirname, 'public'), {
  appUsers: [{ user_name: 'test' }, { user_name: 'test2' }],
  fileContent: objects, //&& JSON.parse(fileContent),
  recordCount,
 });
});

app.get('/chatAI', async function (req, res) {
 res.setHeader('Content-Security-Policy', "script-src 'self' 'nonce-abc123'");
 res.render(path.join(__dirname, 'public', 'chatAI.ejs'));
});

app.use(
 '/graphql',
 graphqlHTTP({
  schema: schema,
  graphiql: true, // Enable GraphiQL for testing
 })
);

// Swagger UI
app.use(openAPIRouter);

// Error handlers
app.use(errorHandler());

export { app, logger };
