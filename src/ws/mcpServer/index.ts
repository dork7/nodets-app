import { parse } from 'url';
import { WebSocketServer } from 'ws';

import { env } from '@/common/utils/envConfig';
import { genCorrelationId } from '@/common/utils/helpers';
import { logger } from '@/server';

import { getMethod } from './methods';

const { HOST } = env;

export const startWebSocketServer = async (httpServer: any) => {
 const wss = new WebSocketServer({ server: httpServer });

 wss.on('connection', (ws: any, request: any) => {
  logger.info('WebSocket client connected - localhost:2020');

  const url = request.url;

  const urlParts = parse(request.url, true); // true = parse query string
  const params: any = urlParts.query;

  if (url.includes('/ws/mcp')) {
   ws.on('message', async (message: any) => {
    logger.info(`Received WebSocket message:   ${message.toString()}`);

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
  } else if (url.includes('/ws/stream')) {
   // Handle other WebSocket paths here
   ws.on('message', (message: any) => {
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
    handler(ws, parsedMessage);

    logger.info(`Received message on /ws/stream: ${message.toString()}`);
    // Process the message as needed
   });
  }

  ws.on('close', () => {
   logger.info('WebSocket client disconnected');
  });
 });

 logger.info(`WebSocket server running on the same HTTP server ws://${HOST}:2020`);
};
