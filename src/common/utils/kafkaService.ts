import { sendMessage } from '@/config/kafka';
import { logger } from '@/server';

import { TOPIC_LIST } from '../data/kafkaTopics';
import { ITopicList } from '../interfaces/kafka';

export const readKafkaMessage = async ({ topic, partition, message }) => {
 logger.info({
  topic,
  partition,
  offset: message.offset,
  value: message.value.toString(),
 });
 console.log('{  value: message.value.toString(),}', { value: message.value.toString() });
};

export const sendKafkaMessage = async (topic: string, message) => {
 //  sendMessage(topic, message);
 TOPIC_LIST.map(async (item: ITopicList) => sendMessage(item.name, message + item.name));
};
