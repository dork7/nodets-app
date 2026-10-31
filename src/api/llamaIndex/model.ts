import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const LlamaIndexIngestSchema = z.object({
 body: z.object({
  type: z.string().min(1).describe('Document type/category to tag the ingested file with (e.g. resume, report, note)'),
  userId: z.string().min(1).describe('Id of the user the ingested document belongs to; scopes retrieval to this user'),
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
  userId: z
   .string()
   .min(1)
   .describe('Id of the user to scope retrieval to; only documents ingested under this id are searched'),
  minScore: z.coerce
   .number()
   .min(0)
   .max(1)
   .optional()
   .describe(
    'Minimum cosine similarity (0-1, higher = closer); chunks scoring below it are dropped. Omit for no cutoff'
   ),
 }),
});

export const LlamaIndexQueryResponseSchema = z.object({
 extractedText: z.string().describe('Concatenated text of the retrieved chunks'),
 sources: z.array(z.record(z.string(), z.unknown())).describe('Metadata of each retrieved chunk'),
 chunks: z
  .array(
   z.object({
    text: z.string(),
    score: z.number().nullable().describe('Cosine similarity to the query (higher = closer)'),
    metadata: z.record(z.string(), z.unknown()),
   })
  )
  .describe('Each retrieved chunk with its similarity score, best match first'),
});
