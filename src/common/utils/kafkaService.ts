import { sendMessage } from '@/config/kafka';
import { logger } from '@/server';

export const readKafkaMessage = async ({ topic, partition, message }) => {
 logger.info({
  topic,
  partition,
  offset: message.offset,
  value: JSON.parse(message.value.toString()),
 });
};

export const sendKafkaMessage = async (topic: string, message) => {
 return sendMessage(topic, JSON.stringify(message));
};
