import { logger } from '@/server';

export const getErrorMessage = (error: unknown): string => {
 if (error instanceof Error && error.message) {
  return error.message;
 }

 if (typeof error === 'string') {
  return error;
 }

 return 'An error occurred while processing your request.';
};

export const sendWebSocketMessage = (ws: any, message: Record<string, unknown>): void => {
 try {
  ws.send(JSON.stringify(message));
 } catch (error) {
  logger.error(`Error sending WebSocket message: ${error}`);
 }
};

export const sendStreamError = (ws: any, messageId: string, error: unknown): void => {
 sendWebSocketMessage(ws, {
  sender: 'AI',
  type: 'stream_error',
  id: messageId,
  error: getErrorMessage(error),
 });
};
