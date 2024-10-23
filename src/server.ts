import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Express } from 'express';
import { graphqlHTTP } from 'express-graphql';
import helmet from 'helmet';
import { pino } from 'pino';

import apis from '@/api';
import { openAPIRouter } from '@/api-docs/openAPIRouter';
import errorHandler from '@/common/middleware/errorHandler';
import rateLimiter from '@/common/middleware/rateLimiter';
import requestLogger from '@/common/middleware/requestLogger';
import { env } from '@/common/utils/envConfig';

import { schema } from './api/graphql/schema';
import { cacheHandler } from './common/utils/cacheHandler';
import { cacheConfigHandler } from './config/cacheConfig';
import { initKafka } from './config/kafka';
import { redisClient } from './config/redisStore';
const logger = pino({ name: 'server start' });
const app: Express = express();
import ejs from 'ejs';

// Set the application to trust the reverse proxy
app.set('trust proxy', true);

if (env.ENV === 'local') {
 redisClient.connect();
 initKafka().catch((err) => logger.error(err));
}

// Middlewares
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(helmet());
app.use(rateLimiter);

app.set('view engine', 'ejs');

// Request logging
app.use(requestLogger);

app.use(express.json());

app.use(
 bodyParser.urlencoded({
  extended: true,
 })
);

app.use(cacheConfigHandler, cacheHandler);
// Routes
app.use('/v1', apis);

app.get('/dashboard', async function (req, res) {
 return await ejs.renderFile('src/public/index.html', {
  //you may include the variable you want to send from backend to UI or can just skip this object incase not required
  users: [{ user_name: 'test' }], //appUsers might be array of objects of users fetched from the database
  appUsers: [{ user_name: 'test' }], //appUsers might be array of objects of users fetched from the database
 });
});

// app.get('/dashboard', function (req, res) {
// //  res.setHeader('Content-Type', 'text/plain');
// //  res.write('foo');
// //  res.write('bar');
// //  res.write('baz');
// //  res.end();

//  res.sendFile(__dirname + '/public/index.html');
// });

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
