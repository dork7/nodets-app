import { TTopicList } from '@/api/kafka/kafkaModel';

export const TOPIC_LIST: TTopicList = [
 {
  topic: 'test',
  configEntries: [
   { name: 'retention.ms', value: '360000' }, // 1 hour
   { name: 'local.retention.ms', value: '360000' }, // 1 hour
   { name: 'file.delete.delay.ms', value: '360000' },
  ],
 },
 {
  topic: 'logging',
  configEntries: [
   { name: 'retention.ms', value: '360000' }, // 1 hour
   { name: 'local.retention.ms', value: '360000' }, // 1 hour
   { name: 'file.delete.delay.ms', value: '360000' },
  ],
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
 },
];
