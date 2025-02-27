import { env } from '@/common/utils/envConfig';
import { app, logger } from '@/server';

const server = app.listen(env.PORT, () => {
 const { NODE_ENV, HOST, PORT } = env;
 logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
 logger.info(`Logger (${NODE_ENV}) running on port http://${HOST}:${PORT}/dashboard`);
 logger.info(`Swaagger http://${HOST}:${PORT}`);
 logger.info(`KAFKA UI http://${HOST}:8083/ui/clusters/kafka/all-topics`);
 logger.info(`Redis http://${HOST}:8001`);
 logger.info(`MONGODB UI http://${HOST}:8081`);
});

const onCloseSignal = () => {
 logger.info('sigint received, shutting down');
 server.close(() => {
  logger.info('server closed');
  process.exit();
 });
 setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on('SIGINT', onCloseSignal);
process.on('SIGTERM', onCloseSignal);

process.on('uncaughtException', (err) => {
 logger.error(err, 'uncaughtException');
 // Perform cleanup or any necessary actions
 // process.exit(1); // Exit the application gracefully
});
