import { env } from '@/common/utils/envConfig';
import { app, logger } from '@/server';

import { loadAIProviders } from './config/openaiConfig/loadAIProviders';
import { startWebSocketServer } from './ws/server';
import { loadHandlers } from './ws/server/methods';

const server = app.listen(env.PORT, async () => {
 const { NODE_ENV, HOST, PORT } = env;
 logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
 logger.info(`Logger (${NODE_ENV}) running on port http://${HOST}:${PORT}/dashboard`);
 logger.info(`Swaagger http://${HOST}:${PORT}`);
 logger.info(`KAFKA UI http://${HOST}:8083/ui/clusters/kafka/all-topics`);
 logger.info(`Redis http://${HOST}:5540`);
 logger.info(`MONGODB UI http://${HOST}:8081`);
 logger.info(`AIChat UI http://${HOST}:${PORT}/chatAi`);
 logger.info(`AI Dashboard http://${HOST}:${PORT}/dashboard`);
 await loadHandlers();
 await loadAIProviders();
 wss = await startWebSocketServer(server);
});

let wss: Awaited<ReturnType<typeof startWebSocketServer>> | undefined;

const onCloseSignal = () => {
 logger.info('sigint received, shutting down');
 // Terminate open WebSocket clients so their sockets don't keep the HTTP
 // server's close() callback waiting indefinitely (e.g. an open chat tab).
 wss?.clients.forEach((client: { terminate: () => void }) => client.terminate());
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

process.on('unhandledRejection', (reason, promise) => {
 logger.error(reason, 'Unhandled Rejection:');
});
