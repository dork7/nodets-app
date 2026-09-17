import { parse } from 'url';
import { WebSocketServer } from 'ws';

import { env } from '@/common/utils/envConfig';
import { genCorrelationId } from '@/common/utils/helpers';
import { getUserIdFromCookieHeader } from '@/config/session';
import { logger } from '@/server';
import { monitorService } from '@/services/monitorService';

import { chatbotHandler } from './handlers/chatbot';
import { getMethod } from './methods';

const { HOST } = env;

export const startWebSocketServer = async (httpServer: any) => {
 const wss = new WebSocketServer({ server: httpServer });

 wss.on('connection', async (ws: any, request: any) => {
  logger.info('WebSocket client connected - localhost:2020');

  const url = request.url;

  const urlParts = parse(request.url, true); // true = parse query string
  const params: any = urlParts.query;

  // Resolved once per connection (not per message) - only /ws/chatAI cares about
  // identity, since Drive tools need to know which user's account to act on.
  // message.id (the client-generated string used elsewhere as a pseudo-userId) is
  // NOT trustworthy for this - it's client-controlled, unlike the signed session cookie.
  ws.userId = url.includes('/ws/chatAI') ? await getUserIdFromCookieHeader(request.headers?.cookie) : null;

  if (url.includes('/ws/server')) {
   ws.on('message', async (message: any) => {
    const startTime = Date.now();
    const rawMessage = message.toString();
    logger.info(`Received WebSocket message:   ${rawMessage}`);

    ws.send(
     JSON.stringify({
      type: 'capabilities',
      tools: ['ping', 'countTo', 'getTime'],
     })
    );

    let parsedMessage;
    try {
     parsedMessage = JSON.parse(rawMessage);
    } catch {
     parsedMessage = { content: rawMessage };
    }

    const handler = getMethod(parsedMessage.method);

    if (!handler) {
     const errorMsg = `Unknown method: ${parsedMessage.method}`;
     await monitorService.logCall('websocket', 'unknown', 'FAILED', Date.now() - startTime, rawMessage, errorMsg);

     return ws.send(
      JSON.stringify({
       type: 'error',
       id: parsedMessage.id,
       error: errorMsg,
      })
     );
    }

    try {
     const result = await handler(parsedMessage);
     const durationMs = Date.now() - startTime;

     await monitorService.logCall('websocket', 'server_handler', 'SUCCESS', durationMs, rawMessage);

     const messageToSend = JSON.stringify({
      type: 'response',
      id: genCorrelationId(),
      result,
     });

     if (params.type === 'broadcast') {
      wss.clients.forEach((client: any) => {
       if (client.readyState === ws.OPEN && client !== ws) {
        client.send(messageToSend);
       }
      });
     } else {
      ws.send(messageToSend);
     }
    } catch (err: any) {
     const errorMsg = err.message || 'Handler error';
     await monitorService.logCall(
      'websocket',
      'server_handler',
      'FAILED',
      Date.now() - startTime,
      rawMessage,
      errorMsg
     );
     ws.send(JSON.stringify({ type: 'error', id: parsedMessage.id, error: errorMsg }));
    }
   });
  } else if (url.includes('/ws/stream')) {
   ws.on('message', async (message: any) => {
    const startTime = Date.now();
    const rawMessage = message.toString();
    let parsedMessage;
    try {
     parsedMessage = JSON.parse(rawMessage);
    } catch {
     parsedMessage = { content: rawMessage };
    }
    const handler = getMethod(parsedMessage.method);

    if (!handler) {
     const errorMsg = `Unknown method: ${parsedMessage.method}`;
     await monitorService.logCall(
      'websocket',
      'stream_handler',
      'FAILED',
      Date.now() - startTime,
      rawMessage,
      errorMsg
     );
     return ws.send(JSON.stringify({ type: 'error', id: parsedMessage.id, error: errorMsg }));
    }

    try {
     await handler(ws, parsedMessage);
     await monitorService.logCall('websocket', 'stream_handler', 'SUCCESS', Date.now() - startTime, rawMessage);
     logger.info(`Received message on /ws/stream: ${rawMessage}`);
    } catch (err: any) {
     await monitorService.logCall(
      'websocket',
      'stream_handler',
      'FAILED',
      Date.now() - startTime,
      rawMessage,
      err.message
     );
    }
   });
  } else if (url.includes('/ws/chatAI')) {
   ws.on('message', async (message: any) => {
    const rawMessage = message.toString();
    let parsedMessage;
    try {
     parsedMessage = JSON.parse(rawMessage);
    } catch {
     parsedMessage = { content: rawMessage };
    }

    // The chatAI handler records its own monitor entry (with the real
    // provider/model/prompt, session id and token usage), so we don't log here.
    try {
     await chatbotHandler(ws, parsedMessage);
     logger.info(`Received message on /ws/chatAI: ${rawMessage}`);
    } catch (err: any) {
     logger.error(`chatAI handler error: ${err?.message}`);
    }
   });
  } else {
   return ws.send(
    JSON.stringify({
     type: 'error',
     error: `Unknown URL: ${url} `,
    })
   );
  }

  ws.on('close', () => {
   logger.info('WebSocket client disconnected');
  });
 });

 logger.info(`WebSocket server running on the same HTTP server ws://${HOST}:2020`);
};
