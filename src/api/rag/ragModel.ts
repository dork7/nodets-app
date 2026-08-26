import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const RagSourceSchema = z.enum(['json', 'minio', 'csv', 'url']);

export const IngestSchema = z.object({
 body: z
  .object({
   source: RagSourceSchema,
   fileId: z.string().optional().describe('MinIO file id (source=minio)'),
   bucket: z.string().optional().describe('MinIO bucket (source=minio)'),
   url: z.string().url().optional().describe('Document URL (source=url)'),
   content: z.string().optional().describe('Raw content (source=csv)'),
   provider: z.string().optional().describe('AI provider used for embeddings'),
   force: z.boolean().optional().default(false).describe('Force re-ingest even if already ingested'),
  })
  .refine((data) => data.source !== 'minio' || Boolean(data.fileId), {
   message: 'fileId is required when source is minio',
   path: ['fileId'],
  })
  .refine((data) => data.source !== 'url' || Boolean(data.url), {
   message: 'url is required when source is url',
   path: ['url'],
  })
  .refine((data) => data.source !== 'csv' || Boolean(data.content), {
   message: 'content is required when source is csv',
   path: ['content'],
  }),
});

export const SearchSchema = z.object({
 query: z.object({
  q: z.string().min(1),
  k: z.coerce.number().int().min(1).max(20).optional().default(3),
 }),
});

export const IngestResponseSchema = z.object({
 count: z.number().int().describe('Number of chunks indexed'),
});

export const SearchResultSchema = z.object({
 id: z.string(),
 text: z.string(),
 source: z.string().optional(),
 score: z.number().optional(),
});

export const SearchResponseSchema = z.object({
 results: z.array(SearchResultSchema),
});

export const StatsResponseSchema = z.object({
 count: z.number().int().describe('Number of indexed chunks'),
 collections: z.array(z.string()),
});

export const TestEmbeddingSchema = z.object({
 text: z.string().min(1),
 provider: z.string().optional(),
});
