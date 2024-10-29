import { randomUUID } from 'crypto';

import { TKafka, TTopicList } from '@/api/kafka/kafkaModel';
import { TOPIC_LIST } from '@/common/data/kafkaTopics';
import { sendMessage } from '@/config/kafka';
import { logger } from '@/server';

export const readKafkaMessage = async (kafkaData: any) => {
 const { topic } = kafkaData;
 const filteredTopics = TOPIC_LIST.filter((item) => item.topic === topic);
 if (filteredTopics.length > 0 && filteredTopics[0].readConfig) {
  filteredTopics[0].readConfig(kafkaData);
 } else {
  logger.error(`Topic ${topic} not found in TOPIC_LIST`);
 }
};

export const sendKafkaMessage = async (kafkaBody: TKafka, correlationID: string) => {
 return sendMessage(kafkaBody.config, kafkaBody.data, correlationID ?? randomUUID());
};
