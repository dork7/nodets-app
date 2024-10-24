import { randomUUID } from 'crypto';

import { TKafka } from '@/api/kafka/kafkaModel';
import { sendMessage } from '@/config/kafka';
import { logger } from '@/server';

import { writeDataInFile } from './fileUtils';

export const readKafkaMessage = async ({ topic, partition, message, heartbeat, pause }) => {
 logger.info({
//   topic,
  partition,
//   offset: message.offset,
//   headers: parseHeaders(message.headers),
  value: JSON.parse(message.value.toString()),
 });
 if (topic === 'file') {
  await writeDataInFile(message.value.toString(), 'file.txt');
 }
};

export const sendKafkaMessage = async (kafkaBody: TKafka, correlationID: string) => {
 return sendMessage(kafkaBody.config, kafkaBody.data, correlationID ?? randomUUID());
};

const parseHeaders = (headers: any) => {
 return Object.keys(headers).map((item: any) => {
  return {
   [item]: Buffer.from(headers[item]).toString(),
  };
 });
};
