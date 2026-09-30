import { WebSocketMessage } from '../../types';

export const normalizeStreamParam = (streamParam: boolean | string | undefined): boolean => {
 if (streamParam === 'false' || streamParam === false) {
  return false;
 }
 return Boolean(streamParam);
};

export const isStopStreamMessage = (message: WebSocketMessage): boolean => message.type === 'stop_stream';

export const formatRequestTime = (timestamp: number): string =>
 new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
