import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export type SettingItem = z.infer<typeof SettingItemSchema>;

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'id must be a valid MongoDB ObjectId');

export const SettingItemSchema = z.object({
 id: objectId,
 name: z.string(),
 createdAt: z.date(),
 updatedAt: z.date(),
});

export const AddSettingItemSchema = z.object({
 body: z.object({ name: z.string().min(1, 'name is required') }),
});

export const DeleteSettingItemSchema = z.object({
 params: z.object({ id: objectId }),
});
