import mongoose from 'mongoose';

import { env } from '@/common/utils/envConfig';
import { logger } from '@/server';

// Exit application on error
mongoose.connection.on('error', (err) => {
 logger.info(`MongoDB connection error: ${err}`, 'ERROR');
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

const connectDB = async () => {
 try {
  await mongoose.connect(mongoURL, {});
 } catch (err: any) {
  logger.info(`MongoDB connection error: ${err.message}`, 'ERROR');
  process.exit(1); // Exit process on failure
 }
};

mongoose.connection.on('disconnected', () => {
 logger.info('MongoDB disconnected! Trying to reconnect...', 'ERROR');
 connectDB();
});

mongoose.connection.on('connected', () => {
 logger.info('MongoDB connected!', 'INFO');
});

export default connectDB;
