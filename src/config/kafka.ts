import { Kafka } from 'kafkajs';

import { TOPIC_LIST } from '@/common/data/kafkaTopics';
import { ITopicList } from '@/common/interfaces/kafka';
import { readKafkaMessage, sendKafkaMessage } from '@/common/utils/kafkaService';

const kafka = new Kafka({
 clientId: 'my-app',
 brokers: ['localhost:29092'],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'test-group' });

export const sendMessage = async (topic: string, message) => {
 return await producer.send({
  topic,
  messages: [{ value: message }],
 });
};

const subscribeTopics = (topicsList: ITopicList[]) => {
 topicsList.map(async (item: ITopicList) => await consumer.subscribe({ topic: item.name, fromBeginning: true }));
};

export const initKafka = async () => {
 // Producing
 await producer.connect();
 // Consuming
 await consumer.connect();

 subscribeTopics(TOPIC_LIST);

 sendKafkaMessage('', 'testing message');

 await consumer.run({
  eachMessage: readKafkaMessage,
 });
};
