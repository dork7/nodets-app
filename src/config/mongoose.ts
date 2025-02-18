import mongoose from 'mongoose';

import { env } from '@/common/utils/envConfig';
import { logger } from '@/server';

// set mongoose Promise to Bluebird
mongoose.Promise = Promise;

// Exit application on error
mongoose.connection.on('error', (err) => {
 logger.error(`MongoDB connection error: ${err}`);
 process.exit(-1);
});

let mongoURL = env.MONGO_URI_LOCAL;
// print mongoose logs in dev env
if (env.NODE_ENV === 'development') {
 mongoose.set('debug', true);
} else {
 mongoURL = env.MONGO_URI;
}

/**
 * Connect to mongo db
 *
 * @returns {object} Mongoose connection
 * @public
 */

export default () => {
 mongoose.connect(mongoURL, {}).then(() => logger.info('mongoDB connected...'));
 return mongoose.connection;
};
