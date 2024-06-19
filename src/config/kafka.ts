import { Kafka } from 'kafkajs';
const kafka = new Kafka({
 clientId: 'my-app',
 brokers: ['localhost:29092'],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'test-group' });

export const run = async () => {
 // Producing
 await producer.connect();
 await producer.send({
  topic: 'test-topic',
  messages: [{ value: 'Hello KafkaJS user! 123 123 123 123 456' }],
 });

 // Consuming
 await consumer.connect();
 await consumer.subscribe({ topic: 'test-topic', fromBeginning: true });

 await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
   console.log({
    partition,
    offset: message.offset,
    value: message.value.toString(),
   });
  },
 });
};

