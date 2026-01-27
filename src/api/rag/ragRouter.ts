import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse } from '@/common/utils/httpHandlers';

import { ragService } from './ragService';

extendZodWithOpenApi(z);

export const ragRegistry = new OpenAPIRegistry();

// Schemas
const IngestFromJsonSchema = z.object({
 body: z.object({
  jsonFilePath: z.string().optional(),
  collectionName: z.string().optional(),
 }),
});

const QueryDatasetSchema = z.object({
 body: z.object({
  question: z.string().min(1, 'Question is required'),
  collectionName: z.string().optional(),
  topK: z.number().int().min(1).max(10).optional().default(3),
  aiModel: z.string().optional(),
 }),
});

const IngestResponseSchema = z.object({
 ingested: z.number(),
 collectionName: z.string(),
});

const QueryResponseSchema = z.object({
 answer: z.string(),
 context: z.array(z.string()),
 sources: z.array(z.string()),
});

const CollectionStatsSchema = z.object({
 count: z.number(),
 name: z.string(),
});

// Register schemas
ragRegistry.register('IngestResponse', IngestResponseSchema);
ragRegistry.register('QueryResponse', QueryResponseSchema);
ragRegistry.register('CollectionStats', CollectionStatsSchema);

// Register paths
ragRegistry.registerPath({
 method: 'post',
 path: '/rag/ingest',
 tags: ['RAG'],
 request: {
  body: {
   content: {
    'application/json': {
     schema: IngestFromJsonSchema.shape.body,
    },
   },
  },
 },
 responses: createApiResponse(IngestResponseSchema, 'Data ingested successfully'),
});

ragRegistry.registerPath({
 method: 'post',
 path: '/rag/query',
 tags: ['RAG'],
 request: {
  body: {
   content: {
    'application/json': {
     schema: QueryDatasetSchema.shape.body,
    },
   },
  },
 },
 responses: createApiResponse(QueryResponseSchema, 'Query processed successfully'),
});

ragRegistry.registerPath({
 method: 'get',
 path: '/rag/stats',
 tags: ['RAG'],
 request: {
  query: z.object({
   collectionName: z.string().optional(),
  }),
 },
 responses: createApiResponse(CollectionStatsSchema, 'Collection stats retrieved successfully'),
});

export const ragRouter: Router = (() => {
 const router = express.Router();

 // Ingest from JSON endpoint
 router.post('/ingest', async (req: Request, res: Response) => {
  try {
   const { jsonFilePath, collectionName } = req.body;
   const serviceResponse = await ragService.ingestFromJson(jsonFilePath, collectionName);
   handleServiceResponse(serviceResponse, res);
  } catch (error) {
   const serviceResponse = await ragService.ingestFromJson();
   handleServiceResponse(serviceResponse, res);
  }
 });

 // Query dataset endpoint
 router.post('/query', async (req: Request, res: Response) => {
  try {
   const { question, collectionName, topK, aiModel } = req.body;

   if (!question || typeof question !== 'string') {
    return res.status(400).json({
     success: false,
     message: 'Question is required and must be a string',
     responseObject: null,
    });
   }

   const serviceResponse = await ragService.queryDataset(question, collectionName, topK, aiModel);
   handleServiceResponse(serviceResponse, res);
  } catch (error) {
    res.status(500).json({
     success: false,
     message: `Error processing query: ${(error as Error).message}`,
     responseObject: null,
    });
  }
 });

 // Get collection stats endpoint
 router.get('/stats', async (req: Request, res: Response) => {
  try {
   const collectionName = (req.query?.collectionName as string | undefined) || undefined;
   const serviceResponse = await ragService.getCollectionStats(collectionName);
   handleServiceResponse(serviceResponse, res);
  } catch (error) {
    res.status(500).json({
     success: false,
     message: `Error getting stats: ${(error as Error).message}`,
     responseObject: null,
    });
  }
 });

 return router;
})();
