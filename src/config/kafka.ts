import { Kafka } from 'kafkajs';

import { TTopicList } from '@/api/kafka/kafkaModel';
import { TOPIC_LIST } from '@/common/data/kafkaTopics';
import { env } from '@/common/utils/envConfig';
import { readKafkaMessage } from '@/common/utils/kafkaService';

const kafka = new Kafka({
 clientId: env.CLIENT_ID,
 brokers: [env.KAFKA_BROKER],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'test-group' });

export const sendMessage = async (topic: string, message: any) => {
 return await producer.send({
  topic,
  messages: [
   {
    key: 'key',
    headers: { 'correlation-id': '2bfb68bb-893a-423b-a7fa-7b568cad5b67', 'system-id': 'my-system' },
    value: message,
   },
  ],
  acks: 1,
 });
};

const subscribeTopics = (topicsList: TTopicList[]) => {
 return topicsList.map(async (item: TTopicList) => await consumer.subscribe({ topic: item.name, fromBeginning: true }));
};

export const initKafka = async () => {
 // Producing
 await producer.connect();
 // Consuming
 await consumer.connect();

 subscribeTopics(TOPIC_LIST);

 await consumer.run({
  eachMessage: readKafkaMessage,
 });
};
