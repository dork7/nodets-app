import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export type FileReference = z.infer<typeof FileReferenceSchema>;

export const FileReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  bucket: z.string(),
  size: z.number(),
  mimetype: z.string(),
  createdAt: z.date(),
});
