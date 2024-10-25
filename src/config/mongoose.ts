import mongoose from 'mongoose';

import { logger } from '@/server';

// set mongoose Promise to Bluebird
mongoose.Promise = Promise;

// Exit application on error
mongoose.connection.on('error', (err) => {
 logger.error(`MongoDB connection error: ${err}`);
 process.exit(-1);
});

// print mongoose logs in dev env
if (env === 'development') {
 mongoose.set('debug', true);
}

/**
 * Connect to mongo db
 *
 * @returns {object} Mongoose connection
 * @public
 */
exports.connect = () => {
 mongoose
  .connect(mongo.uri, {
   useCreateIndex: false,
   keepAlive: 1,
   useNewUrlParser: true,
   useUnifiedTopology: true,
   useFindAndModify: false,
  })
  .then(() => logger.info('mongoDB connected...'));
 return mongoose.connection;
};
