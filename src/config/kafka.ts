import { Kafka } from 'kafkajs';

import { TTopicList } from '@/api/kafka/kafkaModel';
import { TOPIC_LIST } from '@/common/data/kafkaTopics';
import { env } from '@/common/utils/envConfig';
import { sendSlackNotification } from '@/common/utils/slack';
import { logger } from '@/server';
import { readKafkaMessage } from '@/services/kafkaService';

const kafka = new Kafka({
 clientId: env.CLIENT_ID,
 brokers: [env.KAFKA_BROKER],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'test-group' });
const admin = kafka.admin();

export const sendMessage = async (config: any, message: any, correlationId: string) => {
 try {
  return await producer.send({
   ...config,
   messages: [
    {
     partition: config.partition,
     key: 'key',
     headers: { 'correlation-id': correlationId, ENV: env.ENV },
     value: JSON.stringify(message),
    },
   ],
   acks: 1,
  });
 } catch (error: any) {
  sendSlackNotification(
   `Error sending message to Kafka: , Topic: ${config.topic}, Message: ${JSON.stringify(error.message)}`
  );
  logger.error(`Error sending message: ${error}`);
  throw error;
 }
};

const subscribeTopics = (topicsList: TTopicList[]) => {
 return topicsList.map(
  async (item: TTopicList) => await consumer.subscribe({ topic: item.topic, fromBeginning: true })
 );
};

const createTopics = async () => {
 try {
  await admin.connect();

  // Set retention policy to 1 hour (3600000 milliseconds)
  const res = await admin.createTopics({
   topics: TOPIC_LIST,
  });
  logger.info(`Topics created: ${res}`);
  await admin.disconnect();
  return true;
 } catch (error: any) {
  logger.error(`Error creating topics: ${error}`);
  sendSlackNotification(`Error creating topics: ${error}`);
  throw error;
 }
};

export const initKafka = async () => {
 createTopics().then(async () => {
  await producer.connect();
  await consumer.connect();

  await subscribeTopics(TOPIC_LIST);

  await consumer.run({
   eachMessage: readKafkaMessage,
  });
 });
};
