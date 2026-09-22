import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';
import { logger } from '@/server';

import { fileStorageService } from './fileStorageService';

const fileStorageRegistry = new OpenAPIRegistry();

fileStorageRegistry.register('FileStorage', z.object({ id: z.string(), url: z.string(), name: z.string() }));

// Generic upload entrypoint: request handling only. The actual storage backend
// is decided entirely inside fileStorageService - this router never talks to
// it directly.
const upload = multer({
 storage: multer.memoryStorage(),
 limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
});

/** `metadata` arrives as a JSON-encoded string in multipart form fields. */
const parseMetadata = (raw: unknown): Record<string, unknown> | undefined => {
 if (typeof raw !== 'string' || !raw.trim()) {
  return undefined;
 }
 try {
  const parsed = JSON.parse(raw);
  return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
 } catch {
  return undefined;
 }
};

export const fileStorageRouter: Router = (() => {
 const router = express.Router();

 fileStorageRegistry.registerPath({
  method: 'post',
  path: '/fs-util/upload',
  tags: ['FileStorage'],
  requestBody: {
   content: {
    'multipart/form-data': {
     schema: z.object({
      file: z.string(),
      folder: z.string().optional(),
      type: z.string().optional().describe('Category/type tag stored alongside the file reference'),
      metadata: z.string().optional().describe('JSON-encoded metadata object stored alongside the file reference'),
     }),
    },
   },
   description: 'Upload a file through the generic file storage wrapper',
   required: true,
  },
  responses: createApiResponse(z.object({ id: z.string(), url: z.string(), name: z.string() }), 'Success'),
 });

 router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
   return handleServiceResponse(
    new ServiceResponse(ResponseStatus.Failed, 'No file provided', null, StatusCodes.BAD_REQUEST),
    res
   );
  }
  const folder = req.body.folder as string | undefined;
  const type = req.body.type as string | undefined;
  const metadata = parseMetadata(req.body.metadata);
  const serviceResponse = await fileStorageService.uploadFile(req.file, { folder, type, metadata });
  handleServiceResponse(serviceResponse, res);
 });

 fileStorageRegistry.registerPath({
  method: 'post',
  path: '/fs-util/upload/multiple',
  tags: ['FileStorage'],
  requestBody: {
   content: {
    'multipart/form-data': {
     schema: z.object({
      files: z.array(z.string()),
      folder: z.string().optional(),
      type: z.string().optional().describe('Category/type tag stored alongside each file reference'),
      metadata: z.string().optional().describe('JSON-encoded metadata object stored alongside each file reference'),
     }),
    },
   },
   description: 'Upload multiple files through the generic file storage wrapper',
   required: true,
  },
  responses: createApiResponse(z.array(z.object({ id: z.string(), url: z.string(), name: z.string() })), 'Success'),
 });

 router.post('/upload/multiple', upload.array('files', 10), async (req: Request, res: Response) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
   return handleServiceResponse(
    new ServiceResponse(ResponseStatus.Failed, 'No files provided', null, StatusCodes.BAD_REQUEST),
    res
   );
  }
  const folder = req.body.folder as string | undefined;
  const type = req.body.type as string | undefined;
  const metadata = parseMetadata(req.body.metadata);
  const serviceResponse = await fileStorageService.uploadMultipleFiles(req.files as Express.Multer.File[], {
   folder,
   type,
   metadata,
  });
  handleServiceResponse(serviceResponse, res);
 });

 fileStorageRegistry.registerPath({
  method: 'get',
  path: '/fs-util/files',
  tags: ['FileStorage'],
  responses: createApiResponse(z.array(z.object({ id: z.string(), url: z.string(), name: z.string() })), 'Success'),
 });

 router.get('/files', async (_req: Request, res: Response) => {
  const serviceResponse = await fileStorageService.listFiles();
  handleServiceResponse(serviceResponse, res);
 });

 fileStorageRegistry.registerPath({
  method: 'get',
  path: '/fs-util/{id}',
  tags: ['FileStorage'],
  request: { params: z.object({ id: z.string() }) },
  responses: {
   200: createApiResponse(z.unknown(), 'Success'),
   404: createApiResponse(z.unknown(), 'Not Found'),
  },
 });

 router.get('/:id', async (req: Request, res: Response) => {
  try {
   const { id } = req.params;
   const file = await fileStorageService.getFile(id);

   if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
   }

   res.setHeader('Content-Type', file.contentType);
   file.stream.pipe(res);
  } catch (error) {
   logger.error(`Error getting file: ${(error as Error).message}`);
   res.status(500).json({ error: 'Failed to get file' });
  }
 });

 fileStorageRegistry.registerPath({
  method: 'delete',
  path: '/fs-util/all',
  tags: ['FileStorage'],
  responses: createApiResponse(z.number(), 'All files deleted'),
 });

 router.delete('/all', async (req: Request, res: Response) => {
  const folder = req.query.folder as string | undefined;
  const serviceResponse = await fileStorageService.deleteAllFiles(folder);
  handleServiceResponse(serviceResponse, res);
 });

 fileStorageRegistry.registerPath({
  method: 'delete',
  path: '/fs-util/{id}',
  tags: ['FileStorage'],
  request: { params: z.object({ id: z.string() }) },
  responses: createApiResponse(z.boolean(), 'Success'),
 });

 router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const serviceResponse = await fileStorageService.deleteFile(id);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
