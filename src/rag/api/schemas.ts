import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/** A multipart field carrying JSON; an empty field counts as absent. */
const jsonField = <T extends z.ZodTypeAny>(schema: T, label: string) =>
 z
  .string()
  .optional()
  .transform((raw, ctx) => {
   if (!raw?.trim()) return undefined;
   try {
    return JSON.parse(raw) as unknown;
   } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be valid JSON` });
    return z.NEVER;
   }
  })
  .pipe(schema.optional());

const collection = z.string().trim().min(1).max(100).describe('Logical namespace the content belongs to');
// There is no auth middleware in this app yet, so the caller's identity is the userId it
// sends - the same convention as /v1/llamaIndex. An auth middleware passed to mountRag() overrides it.
const userId = z
 .string()
 .trim()
 .min(1)
 .max(200)
 .describe('Id of the calling user; scopes retrieval and is written to the logs');

// Metadata and ACL are copied into the payload of every chunk, so both are kept small.
const metadataValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
const metadataSchema = z
 .record(z.string().max(64), metadataValue)
 .refine((m) => Object.keys(m).length <= 30, 'metadata may have at most 30 keys');
const aclEntry = z
 .string()
 .regex(/^(\*|(user|group):[A-Za-z0-9_.@-]{1,200})$/, 'acl entries must be "user:<id>", "group:<id>" or "*"');

export const IngestFields = z.object({
 collection,
 userId,
 text: z.string().optional().describe('Inline plain text or Markdown, instead of or alongside files'),
 textFormat: z.enum(['plain', 'markdown']).default('plain'),
 metadata: jsonField(metadataSchema, 'metadata').describe('Small JSON object of scalars, copied into every chunk'),
 acl: jsonField(z.array(aclEntry).max(50), 'acl').describe(
  'JSON array of user:<id> / group:<id> principals allowed to retrieve this content'
 ),
});

export const RetrieveRequest = z.object({
 question: z.string().trim().min(1).max(4000),
 collection,
 userId,
 filters: z.record(z.unknown()).optional().describe('Allowed keys: docId, filename, modality, page'),
 topK: z.number().int().min(1).max(50).optional(),
 mode: z.enum(['answer', 'chunks']).default('answer'),
});

export const UserQuery = z.object({ userId });

// ===== OpenAPI =====

export const ragPipelineRegistry = new OpenAPIRegistry();

const JobSchema = z.object({ jobId: z.string(), docId: z.string(), filename: z.string(), status: z.string() });
const ErrorSchema = z.object({
 error: z.object({ code: z.string(), message: z.string(), requestId: z.string(), errorId: z.string().nullable() }),
});
const json = (schema: z.ZodTypeAny, description: string) => ({
 description,
 content: { 'application/json': { schema } },
});
const errors = { 400: json(ErrorSchema, 'Invalid request'), 500: json(ErrorSchema, 'Internal error') };
const userIdQuery = z.object({ userId: z.string() });

ragPipelineRegistry.registerPath({
 method: 'post',
 path: '/ingest',
 tags: ['RAG pipeline'],
 request: {
  body: {
   required: true,
   description: 'Files and/or inline text to parse, embed and index. Processed asynchronously by the ingestion worker.',
   content: {
    'multipart/form-data': {
     schema: z.object({
      files: z.any().describe('pdf, docx, pptx, xlsx, csv, html, md, txt, png, jpg, webp, gif, tiff'),
      collection: z.string(),
      userId: z.string(),
      text: z.string().optional(),
      textFormat: z.enum(['plain', 'markdown']).optional(),
      metadata: z.string().optional().describe('JSON object'),
      acl: z.string().optional().describe('JSON array of principals'),
     }),
    },
   },
  },
 },
 responses: { 202: json(z.object({ jobs: z.array(JobSchema) }), 'Accepted'), ...errors },
});

ragPipelineRegistry.registerPath({
 method: 'get',
 path: '/ingest/{jobId}',
 tags: ['RAG pipeline'],
 request: { params: z.object({ jobId: z.string() }), query: userIdQuery },
 responses: {
  200: json(
   z.object({
    jobId: z.string(),
    docId: z.string(),
    status: z.enum(['queued', 'running', 'succeeded', 'failed']),
    stage: z.string().nullable(),
    counts: z.object({ text: z.number(), table: z.number(), image: z.number() }),
    errorId: z.string().nullable(),
   }),
   'Job status'
  ),
  404: json(ErrorSchema, 'Job not found'),
 },
});

ragPipelineRegistry.registerPath({
 method: 'delete',
 path: '/documents/{docId}',
 tags: ['RAG pipeline'],
 request: { params: z.object({ docId: z.string() }), query: userIdQuery },
 responses: {
  200: json(z.object({ deleted: z.boolean(), docId: z.string() }), 'Deleted'),
  404: json(ErrorSchema, 'Document not found'),
 },
});

ragPipelineRegistry.registerPath({
 method: 'post',
 path: '/retrieve',
 tags: ['RAG pipeline'],
 request: {
  body: {
   required: true,
   content: {
    'application/json': {
     schema: z.object({
      question: z.string(),
      collection: z.string(),
      userId: z.string(),
      filters: z.record(z.unknown()).optional(),
      topK: z.number().optional(),
      mode: z.enum(['answer', 'chunks']).optional(),
     }),
    },
   },
  },
 },
 responses: {
  200: json(
   z.object({
    answer: z.string().nullable(),
    verified: z.boolean(),
    verification: z.any().nullable(),
    citations: z.array(
     z.object({
      sourceId: z.string(),
      docId: z.string(),
      filename: z.string(),
      page: z.number().nullable(),
      modality: z.enum(['text', 'table', 'image']),
      snippet: z.string(),
     })
    ),
    requestId: z.string(),
   }),
   'Answer with its verification result and citations'
  ),
  ...errors,
 },
});
