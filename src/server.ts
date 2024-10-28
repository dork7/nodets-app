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
import { reqLoggerKafka } from './common/middleware/reqLoggerKafka';
import { cacheHandler } from './common/utils/cacheHandler';
import { cacheConfig, cacheConfigHandler } from './config/cacheConfig';
import { initKafka } from './config/kafka';
import { redisClient } from './config/redisStore';
import { readFileData } from './common/utils/fileUtils';
import { proxyHandler } from './common/middleware/proxy';
const logger = pino({ name: 'server start' });
const app: Express = express();

// Set the application to trust the reverse proxy
app.set('trust proxy', true);

if (env.ENV === 'local') {
 redisClient.connect();
 initKafka().catch((err) => logger.error(err));
 global.cacheHash = cacheConfig.createHash(cacheRules);
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
 res.render(path.join(__dirname, 'public'), {
  appUsers: [{ user_name: 'test' }, { user_name: 'test2' }],
  fileContent: fileContent,
 });
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
