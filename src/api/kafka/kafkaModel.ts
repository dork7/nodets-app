import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { kafkaTopicValidation } from '@/common/utils/commonValidation';

extendZodWithOpenApi(z);

export type TKafka = z.infer<typeof KafkaSchema>;
export type TTopicList = z.infer<typeof TopicList>;

export const TopicList = z.object({
 name: z.string(),
});
export const KafkaSchema = z.object({
 topic: z.string(),
 data: z.object({}),
});

export const PostKafkaSchema = z.object({
 body: z.object({
  topic: z.string(),
  data: z.object({}),
 }),
});

export const GetKafkaSchema = z.object({
 params: z.object({ topic: kafkaTopicValidation.topic }),
});
