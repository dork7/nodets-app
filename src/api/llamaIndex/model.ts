import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const LlamaIndexIngestSchema = z.object({
 body: z.object({
  type: z.string().min(1).describe('Document type/category to tag the ingested file with (e.g. resume, report, note)'),
 }),
});

export const LlamaIndexIngestResponseSchema = z.object({
 id: z.string().describe('Id of the indexed document'),
 filename: z.string(),
 type: z.string(),
});

export const LlamaIndexQuerySchema = z.object({
 query: z.object({
  q: z.string().min(1).describe('Natural language question to ask against the ingested files'),
  k: z.coerce.number().int().min(1).max(20).optional().default(3).describe('Number of source chunks to retrieve'),
 }),
});

export const LlamaIndexQueryResponseSchema = z.object({
 extractedText: z.string().describe('Concatenated text of the retrieved chunks'),
 sources: z.array(z.record(z.string(), z.unknown())).describe('Metadata of each retrieved chunk'),
});
