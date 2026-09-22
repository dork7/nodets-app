import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import { z } from 'zod';

import {
 LlamaIndexIngestResponseSchema,
 LlamaIndexQueryResponseSchema,
 LlamaIndexQuerySchema,
} from '@/api/llamaIndex/model';
import { llamaIndexService } from '@/api/llamaIndex/service';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

extendZodWithOpenApi(z);

export const llamaIndexRegistry = new OpenAPIRegistry();

const upload = multer({
 storage: multer.memoryStorage(),
 limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const multipartSchema = z.object({
 file: z.any(),
 type: z.string().min(1).describe('Document type/category to tag the file with'),
 id: z.string().optional().describe('Existing file id to ingest under (e.g. a localStorage/fs-util fileId)'),
});

llamaIndexRegistry.registerPath({
 method: 'post',
 path: '/llamaIndex/ingest',
 tags: ['LlamaIndex'],
 request: {
  body: {
   content: { 'multipart/form-data': { schema: multipartSchema } },
   description: 'Ingest a file into the LlamaIndex vector index, tagged with a type',
   required: true,
  },
 },
 responses: createApiResponse(LlamaIndexIngestResponseSchema, 'Success'),
});

export const llamaIndexRouter: Router = (() => {
 const router = express.Router();
 const singleUpload = upload.single('file');

 router.post('/ingest', (req: Request, res: Response) => {
  singleUpload(req, res, async (err: unknown) => {
   if (err) {
    const errorMessage = err instanceof multer.MulterError ? err.message : 'Unable to process the uploaded file.';
    const statusCode =
     err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? StatusCodes.REQUEST_TOO_LONG
      : StatusCodes.BAD_REQUEST;

    return handleServiceResponse(new ServiceResponse(ResponseStatus.Failed, errorMessage, null, statusCode, err), res);
   }

   const type = String(req.body?.type ?? '').trim();
   if (!type) {
    return handleServiceResponse(
     new ServiceResponse(ResponseStatus.Failed, 'type is required', null, StatusCodes.BAD_REQUEST),
     res
    );
   }

   const id = req.body?.id ? String(req.body.id).trim() || undefined : undefined;
   const serviceResponse = await llamaIndexService.ingestFile(req.file, type, id);
   handleServiceResponse(serviceResponse, res);
  });
 });

 llamaIndexRegistry.registerPath({
  method: 'post',
  path: '/llamaIndex/ingest/{id}',
  tags: ['LlamaIndex'],
  request: {
   params: z.object({ id: z.string() }),
   body: {
    content: {
     'application/json': {
      schema: z.object({ type: z.string().min(1).describe('Document type/category to tag the file with') }),
     },
    },
    required: true,
   },
  },
  responses: createApiResponse(LlamaIndexIngestResponseSchema, 'Success'),
 });

 router.post('/ingest/:id', async (req: Request, res: Response) => {
  const type = String(req.body?.type ?? '').trim();
  if (!type) {
   return handleServiceResponse(
    new ServiceResponse(ResponseStatus.Failed, 'type is required', null, StatusCodes.BAD_REQUEST),
    res
   );
  }

  const serviceResponse = await llamaIndexService.ingestFileFromStorage(req.params.id, type);
  handleServiceResponse(serviceResponse, res);
 });

 llamaIndexRegistry.registerPath({
  method: 'get',
  path: '/llamaIndex/query',
  tags: ['LlamaIndex'],
  request: {
   query: LlamaIndexQuerySchema.shape.query,
  },
  responses: createApiResponse(LlamaIndexQueryResponseSchema, 'Success'),
 });

 router.get('/query', validateRequest(LlamaIndexQuerySchema), async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '');
  const k = Number(req.query.k ?? 3);
  const serviceResponse = await llamaIndexService.query(q, k);
  handleServiceResponse(serviceResponse, res);
 });

 llamaIndexRegistry.registerPath({
  method: 'get',
  path: '/llamaIndex/extract',
  tags: ['LlamaIndex'],
  request: {
   query: LlamaIndexQuerySchema.shape.query,
  },
  responses: createApiResponse(LlamaIndexQueryResponseSchema, 'Success'),
 });

 router.get('/extract', validateRequest(LlamaIndexQuerySchema), async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '');
  const k = Number(req.query.k ?? 3);
  const serviceResponse = await llamaIndexService.extract(q, k);
  handleServiceResponse(serviceResponse, res);
 });

 llamaIndexRegistry.registerPath({
  method: 'delete',
  path: '/llamaIndex/file/{id}',
  tags: ['LlamaIndex'],
  request: { params: z.object({ id: z.string() }) },
  responses: createApiResponse(z.boolean(), 'Success'),
 });

 router.delete('/file/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const serviceResponse = await llamaIndexService.deleteFile(id);
  handleServiceResponse(serviceResponse, res);
 });

 llamaIndexRegistry.registerPath({
  method: 'delete',
  path: '/llamaIndex',
  tags: ['LlamaIndex'],
  responses: createApiResponse(z.boolean(), 'Success'),
 });

 router.delete('/', async (_req: Request, res: Response) => {
  const serviceResponse = await llamaIndexService.clear();
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
