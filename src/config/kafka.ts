import { Kafka } from 'kafkajs';

import { TTopicList } from '@/api/kafka/kafkaModel';
import { TOPIC_LIST } from '@/common/data/kafkaTopics';
import { readKafkaMessage } from '@/common/utils/kafkaService';

const kafka = new Kafka({
 clientId: 'my-app',
 brokers: ['localhost:29092'],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'test-group' });

export const sendMessage = async (topic: string, message: any) => {
 return await producer.send({
  topic,
  messages: [{ value: message }],
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
