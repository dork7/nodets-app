import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import {
 IngestResponseSchema,
 IngestSchema,
 RagSourceSchema,
 SearchResponseSchema,
 SearchSchema,
 StatsResponseSchema,
 TestEmbeddingRequestSchema,
 TestEmbeddingResponseSchema,
} from '@/api/rag/ragModel';
import { ragService } from '@/api/rag/ragService';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

const ragRegistry = new OpenAPIRegistry();

ragRegistry.register('RagSource', RagSourceSchema);

export { ragRegistry };

export const ragRouter: Router = (() => {
 const router = express.Router();

 ragRegistry.registerPath({
  method: 'post',
  path: '/rag/ingest',
  tags: ['RAG'],
  request: {
   body: {
    content: { 'application/json': { schema: IngestSchema.shape.body } },
    description: 'Ingest documents into the RAG knowledge base',
    required: true,
   },
  },
  responses: createApiResponse(IngestResponseSchema, 'Success'),
 });

 ragRegistry.registerPath({
  method: 'post',
  path: '/rag/test-embed',
  tags: ['RAG'],
  request: {
   body: {
    content: { 'application/json': { schema: TestEmbeddingRequestSchema.shape.body } },
    description: 'Test storing text embedding in ChromaDB',
   },
  },
  responses: createApiResponse(TestEmbeddingResponseSchema, 'Success'),
});

router.post('/test-embed', validateRequest(TestEmbeddingRequestSchema), async (req: Request, res: Response) => {
  const serviceResponse = await ragService.storeText(req.body.text, req.body.provider);
  handleServiceResponse(serviceResponse, res);
});

 router.post('/ingest', validateRequest(IngestSchema), async (req: Request, res: Response) => {
  const serviceResponse = await ragService.ingest(req.body);
  handleServiceResponse(serviceResponse, res);
 });

 ragRegistry.registerPath({
  method: 'get',
  path: '/rag/search',
  tags: ['RAG'],
  request: {
   query: SearchSchema.shape.query,
  },
  responses: createApiResponse(SearchResponseSchema, 'Success'),
 });

 router.get('/search', validateRequest(SearchSchema), async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '');
  const k = Number(req.query.k ?? 3);
  const serviceResponse = await ragService.search(q, k);
  handleServiceResponse(serviceResponse, res);
 });

 ragRegistry.registerPath({
  method: 'delete',
  path: '/rag/file/{id}',
  tags: ['RAG'],
  request: {
   params: z.object({ id: z.string().describe('Document id (MinIO file id, or the ingest id prefix)') }),
  },
  responses: createApiResponse(z.object({ removed: z.number().int() }), 'Removed'),
 });

 router.delete('/file/:id', async (req: Request, res: Response) => {
  const serviceResponse = await ragService.deleteFile(String(req.params.id));
  handleServiceResponse(serviceResponse, res);
 });

 ragRegistry.registerPath({
  method: 'delete',
  path: '/rag',
  tags: ['RAG'],
  responses: createApiResponse(z.boolean(), 'Cleared'),
 });

 router.delete('/', async (_req: Request, res: Response) => {
  const serviceResponse = await ragService.clear();
  handleServiceResponse(serviceResponse, res);
 });

 ragRegistry.registerPath({
  method: 'get',
  path: '/rag/stats',
  tags: ['RAG'],
  responses: createApiResponse(StatsResponseSchema, 'Success'),
 });

 router.get('/stats', async (_req: Request, res: Response) => {
  const serviceResponse = await ragService.stats();
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
