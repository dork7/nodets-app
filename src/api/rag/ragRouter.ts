import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
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

const DeleteCollectionResponseSchema = z.object({
 deleted: z.boolean(),
 collectionName: z.string(),
});

// Configure multer for file uploads
const upload = multer({
 storage: multer.memoryStorage(),
 limits: {
  fileSize: 50 * 1024 * 1024, // 50MB max file size
 },
 fileFilter: (_req, file, cb) => {
  // Allow text, PDF, and DOCX files
  const allowedMimeTypes = [
   'text/plain',
   'application/pdf',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  const allowedExtensions = ['.txt', '.pdf', '.docx'];

  const hasAllowedMimeType = allowedMimeTypes.includes(file.mimetype);
  const hasAllowedExtension = allowedExtensions.some((ext) =>
   file.originalname.toLowerCase().endsWith(ext)
  );

  if (hasAllowedMimeType || hasAllowedExtension) {
   cb(null, true);
  } else {
   cb(
    new multer.MulterError(
     'LIMIT_UNEXPECTED_FILE',
     `File type not supported. Allowed types: ${allowedExtensions.join(', ')}`
    )
   );
  }
 },
});

// Register schemas
ragRegistry.register('IngestResponse', IngestResponseSchema);
ragRegistry.register('QueryResponse', QueryResponseSchema);
ragRegistry.register('CollectionStats', CollectionStatsSchema);
ragRegistry.register('DeleteCollectionResponse', DeleteCollectionResponseSchema);

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

ragRegistry.registerPath({
 method: 'post',
 path: '/rag/ingest-file',
 tags: ['RAG'],
 request: {
  body: {
   content: {
    'multipart/form-data': {
     schema: z.object({
      file: z.any(),
      collectionName: z.string().optional(),
      chunkSize: z.number().optional(),
      overlap: z.number().optional(),
     }),
    },
   },
  },
 },
 responses: createApiResponse(IngestResponseSchema, 'File ingested successfully'),
});

ragRegistry.registerPath({
 method: 'delete',
 path: '/rag/collection',
 tags: ['RAG'],
 request: {
  query: z.object({
   collectionName: z.string().optional(),
  }),
 },
 responses: createApiResponse(DeleteCollectionResponseSchema, 'Collection deleted successfully'),
});

export const ragRouter: Router = (() => {
 const router = express.Router();
 const singleUpload = upload.single('file');

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

 // Ingest from file endpoint
 router.post('/ingest-file', (req: Request, res: Response) => {
  singleUpload(req, res, async (err: unknown) => {
   if (err) {
    const errorMessage =
     err instanceof multer.MulterError
      ? err.message
      : 'Unable to process the uploaded file.';
    const statusCode =
     err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? 413 // PAYLOAD_TOO_LARGE
      : StatusCodes.BAD_REQUEST;

    const serviceResponse = new ServiceResponse(
     ResponseStatus.Failed,
     errorMessage,
     null,
     statusCode,
     err
    );

    return handleServiceResponse(serviceResponse, res);
   }

   const file = req.file;

   if (!file) {
    const serviceResponse = new ServiceResponse(
     ResponseStatus.Failed,
     'File is required. Please upload a file using the "file" form field.',
     null,
     StatusCodes.BAD_REQUEST
    );
    return handleServiceResponse(serviceResponse, res);
   }

   try {
    const collectionName = req.body.collectionName || undefined;
    const chunkSize = req.body.chunkSize ? parseInt(req.body.chunkSize, 10) : undefined;
    const overlap = req.body.overlap ? parseInt(req.body.overlap, 10) : undefined;

    const options = {
     ...(chunkSize && { chunkSize }),
     ...(overlap && { overlap }),
    };

    const serviceResponse = await ragService.ingestFromFile(file, collectionName, options);
    handleServiceResponse(serviceResponse, res);
   } catch (error) {
    const serviceResponse = new ServiceResponse(
     ResponseStatus.Failed,
     `Error ingesting file: ${(error as Error).message}`,
     null,
     StatusCodes.INTERNAL_SERVER_ERROR,
     error
    );
    handleServiceResponse(serviceResponse, res);
   }
  });
 });

 // Delete collection endpoint
 router.delete('/collection', async (req: Request, res: Response) => {
  try {
   const collectionName = (req.query?.collectionName as string | undefined) || undefined;
   const serviceResponse = await ragService.deleteCollection(collectionName);
   handleServiceResponse(serviceResponse, res);
  } catch (error) {
   res.status(500).json({
    success: false,
    message: `Error deleting collection: ${(error as Error).message}`,
    responseObject: null,
   });
  }
 });

 return router;
})();
