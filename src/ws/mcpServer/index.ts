import { parse } from 'url';
import { WebSocketServer } from 'ws';

import { env } from '@/common/utils/envConfig';
import { genCorrelationId } from '@/common/utils/helpers';
import { logger } from '@/server';

import { getMethod, loadHandlers } from './methods';

const { HOST } = env;

export const startWebSocketServer = async (httpServer: any) => {
 const wss = new WebSocketServer({ server: httpServer, path: '/ws/mcp' });

 wss.on('connection', (ws: any, request: any) => {
  logger.info('WebSocket client connected - localhost:2020/ws/mcp?type=mcp');
  const urlParts = parse(request.url, true); // true = parse query string
  const params: any = urlParts.query;

  ws.on('message', async (message: any) => {
   logger.info('Received WebSocket message:', message.toString());

   let parsedMessage;
   try {
    parsedMessage = JSON.parse(message.toString());
   } catch {
    parsedMessage = { content: message.toString() };
   }

   const handler = getMethod(parsedMessage.method);

   if (!handler) {
    return ws.send(
     JSON.stringify({
      type: 'error',
      id: message.id,
      error: `Unknown method: ${message.method}`,
     })
    );
   }
   const result = await handler(message.params);
   const messageToSend = JSON.stringify({
    type: 'response',
    id: genCorrelationId(),
    result,
   });

   if (params.type === 'broadcast') {
    // Broadcast message to all connected clients

    wss.clients.forEach((client: any) => {
     if (client.readyState === ws.OPEN && client !== ws) {
      client.send(messageToSend);
     }
    });
   } else {
    ws.send(messageToSend);
   }
  });

  ws.on('close', () => {
   logger.info('WebSocket client disconnected');
  });
 });

 logger.info(`WebSocket server running on the same HTTP server ws://${HOST}:2020`);
};
