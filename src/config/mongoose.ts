import mongoose from 'mongoose';

import { env } from '@/common/utils/envConfig';
import { sendSlackMessage } from '@/common/utils/slack';

// Exit application on error
mongoose.connection.on('error', (err) => {
 sendSlackMessage(`MongoDB connection error: ${err}`, 'ERROR');
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
//   sendSlackMessage(`MongoDB connection error: ${err.message}`, 'ERROR');
  process.exit(1); // Exit process on failure
 }
};

mongoose.connection.on('disconnected', () => {
 sendSlackMessage('MongoDB disconnected! Trying to reconnect...', 'ERROR');
 connectDB();
});

mongoose.connection.on('connected', () => {
 sendSlackMessage('MongoDB connected!', 'INFO');
});

export default connectDB;
