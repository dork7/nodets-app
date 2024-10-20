import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { kafkaTopicValidation } from '@/common/utils/commonValidation';

extendZodWithOpenApi(z);

export type TKafka = z.infer<typeof KafkaSchema>;
export type TTopicList = z.infer<typeof TopicList>;

export const TopicList = z.object({
 topic: z.string(),
 configEntries: z.array(z.object({})).optional(),
});
export const KafkaSchema = z.object({
 config: z.object({}),
 data: z.object({}),
});

export const PostKafkaSchema = z.object({
 body: z.object({
    config: z.object({}),
    data: z.object({}),
 }),
});

export const GetKafkaSchema = z.object({
 params: z.object({ topic: kafkaTopicValidation.topic }),
});
