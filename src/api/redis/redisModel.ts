import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export type Redis = z.infer<typeof RedisSchema>;

export const RedisSchema = z.object({});

export const storeDataSchema = z.object({
 params: z.object({ key: z.string() }),
 body: z.object({
  id: z.number(),
 }),
});
export const getDataSchema = z.object({
 params: z.object({ key: z.string() }),
});
