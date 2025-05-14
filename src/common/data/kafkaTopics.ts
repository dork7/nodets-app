import { TTopicList } from '@/api/kafka/kafkaModel';
import { updateOrderCountInUser } from '@/api/user/utils';
import { logger } from '@/server';

import { writeDataInFile } from '../utils/fileUtils';

export const TOPIC_LIST: TTopicList[] = [
 {
  topic: 'test',
  configEntries: [
   { name: 'retention.ms', value: '360000' }, // 1 hour
   { name: 'local.retention.ms', value: '360000' }, // 1 hour
   { name: 'file.delete.delay.ms', value: '360000' },
  ],
  readConfig: async ({ topic, partition, message, heartbeat, pause }: any) => {
   await writeDataInFile(JSON.parse(message.value.toString()), 'file.txt');
  },
 },
 {
  topic: 'logging',
  configEntries: [
   { name: 'retention.ms', value: '360000' }, // 1 hour
   { name: 'local.retention.ms', value: '360000' }, // 1 hour
   { name: 'file.delete.delay.ms', value: '360000' },
  ],
  readConfig: async ({ topic, partition, message, heartbeat, pause }) => {
   //    logger.info(JSON.parse(message.value.toString()));
   await writeDataInFile(message.value.toString(), 'file.txt');
   return null;
  },
 },
 {
  topic: 'file',
  numPartitions: 3, // Specify the number of partitions
  replicationFactor: 1, // Specify the replication factor
  configEntries: [
   { name: 'retention.ms', value: '360000' }, // 1 hour
   { name: 'local.retention.ms', value: '360000' }, // 1 hour
   { name: 'file.delete.delay.ms', value: '360000' },
  ],
  readConfig: (data) => {
   logger.info(data);
  },
 },
 {
  topic: 'orders',
  numPartitions: 1, // Specify the number of partitions
  replicationFactor: 1, // Specify the replication factor
  configEntries: [
   { name: 'retention.ms', value: '360000' }, // 1 hour
   { name: 'local.retention.ms', value: '360000' }, // 1 hour
   { name: 'file.delete.delay.ms', value: '360000' },
  ],
  readConfig: async ({ topic, partition, message, heartbeat, pause }: any) => {
   const parsedMessage = JSON.parse(message.value.toString());
   switch (parsedMessage.action) {
    case 'UPDATE_ORDER_COUNT':
     logger.info('Update Order');
     updateOrderCountInUser(JSON.parse(message.value.toString()));
     break;
    default:
     logger.info('Default');
     break;
   }
  },
 },
];
