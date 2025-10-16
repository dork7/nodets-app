import { parse } from 'url';
import { WebSocketServer } from 'ws';

import { env } from '@/common/utils/envConfig';
import { sendSlackNotification } from '@/common/utils/slack';
import { logger } from '@/server';

// import { handleMCPMessage } from './mcpHandler.js';
const { HOST } = env;

export function startWebSocketServer(httpServer: any) {
 const wss = new WebSocketServer({ server: httpServer, path: '/ws/mcp' });

 wss.on('connection', (ws: any, request: any) => {
  logger.info('WebSocket client connected - localhost:2020/ws/mcp?type=mcp');
  const urlParts = parse(request.url, true); // true = parse query string
  const params: any = urlParts.query;

  ws.on('message', (message: any) => {
   logger.info('Received WebSocket message:', message.toString());

   let parsedMessage;
   try {
    parsedMessage = JSON.parse(message.toString());
   } catch {
    parsedMessage = { content: message.toString() };
   }

   if (params.type === 'broadcast') {
    // Broadcast message to all connected clients

    wss.clients.forEach((client: any) => {
     if (client.readyState === ws.OPEN && client !== ws) {
      client.send(message.toString());
     }
    });
   } else {
    const response = handleMCPMessage(parsedMessage);

    ws.send(JSON.stringify(response));
   }
  });

  ws.on('close', () => {
   logger.info('WebSocket client disconnected');
  });
 });

 logger.info(`WebSocket server running on the same HTTP server ws://${HOST}:2020`);
}

export function handleMCPMessage(message: any) {
 logger.info('Processing MCP message:', message);

 sendSlackNotification(`WS message: ${message}`, 'INFO');

 return {
  type: 'mcp_response',
  data: message
 };
}
