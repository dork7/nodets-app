import { randomUUID } from 'crypto';

import { sendMessage } from '@/config/kafka';
import { logger } from '@/server';

export const readKafkaMessage = async ({ topic, partition, message, heartbeat, pause }) => {
 logger.info({
  topic,
  partition,
  offset: message.offset,
  headers: parseHeaders(message.headers),
  value: JSON.parse(message.value.toString()),
 });
};

export const sendKafkaMessage = async (topic: string, message: any, correlationID: string) => {
 return sendMessage(topic, JSON.stringify(message), correlationID ?? randomUUID());
};

const parseHeaders = (headers: any) => {
 return Object.keys(headers).map((item: any) => {
  return {
   [item]: Buffer.from(headers[item]).toString(),
  };
 });
};
