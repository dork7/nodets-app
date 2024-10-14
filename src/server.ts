import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Express } from 'express';
import { graphqlHTTP } from 'express-graphql';
import helmet from 'helmet';
import { pino } from 'pino';

import { openAPIRouter } from '@/api-docs/openAPIRouter';
import { healthCheckRouter } from '@/api/healthCheck/healthCheckRouter';
import { userRouter } from '@/api/user/userRouter';
import errorHandler from '@/common/middleware/errorHandler';
import rateLimiter from '@/common/middleware/rateLimiter';
import requestLogger from '@/common/middleware/requestLogger';
import { env } from '@/common/utils/envConfig';

import { catalogueRouter } from './api/catalogue/catalogueRouter';
import { schema } from './api/graphql/schema';
import { kafkaRouter } from './api/kafka/kafkaRouter';
import { redisRouter } from './api/redis/redisRouter';
import { initKafka } from './config/kafka';
import { redisClient } from './config/redisStore';

const logger = pino({ name: 'server start' });
const app: Express = express();

// Set the application to trust the reverse proxy
app.set('trust proxy', true);

if (env.ENV === 'local') {
 redisClient.connect();
 initKafka().catch(console.error);
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

// Routes
app.use('/health-check', healthCheckRouter);
app.use('/users', userRouter);
app.use('/redis', redisRouter);
app.use('/kafka', kafkaRouter);
app.use('/catalogue', catalogueRouter);

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
