import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';
import { logger } from '@/server';

import { localStorageService, localStorageUpload } from './localStorageService';

const localStorageRegistry = new OpenAPIRegistry();

localStorageRegistry.register('LocalStorage', z.object({ id: z.string(), url: z.string(), name: z.string() }));

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

export const localStorageRouter: Router = (() => {
 const router = express.Router();

 localStorageRegistry.registerPath({
  method: 'post',
  path: '/localStorage/upload',
  tags: ['LocalStorage'],
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
   description: 'Upload a file to local storage',
   required: true,
  },
  responses: createApiResponse(z.object({ id: z.string(), url: z.string(), name: z.string() }), 'Success'),
 });

 router.post('/upload', localStorageUpload.single, async (req: Request, res: Response) => {
  if (!req.file) {
   return handleServiceResponse(
    new ServiceResponse(ResponseStatus.Failed, 'No file provided', null, StatusCodes.BAD_REQUEST),
    res
   );
  }
  const folder = req.body.folder as string | undefined;
  const type = req.body.type as string | undefined;
  const metadata = parseMetadata(req.body.metadata);
  const serviceResponse = await localStorageService.uploadFile(req.file, folder, type, metadata);
  handleServiceResponse(serviceResponse, res);
 });

 localStorageRegistry.registerPath({
  method: 'post',
  path: '/localStorage/upload/multiple',
  tags: ['LocalStorage'],
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
   description: 'Upload multiple files to local storage',
   required: true,
  },
  responses: createApiResponse(z.array(z.object({ id: z.string(), url: z.string(), name: z.string() })), 'Success'),
 });

 router.post('/upload/multiple', localStorageUpload.multiple, async (req: Request, res: Response) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
   return handleServiceResponse(
    new ServiceResponse(ResponseStatus.Failed, 'No files provided', null, StatusCodes.BAD_REQUEST),
    res
   );
  }
  const folder = req.body.folder as string | undefined;
  const type = req.body.type as string | undefined;
  const metadata = parseMetadata(req.body.metadata);
  const serviceResponse = await localStorageService.uploadMultipleFiles(
   req.files as Express.Multer.File[],
   folder,
   type,
   metadata
  );
  handleServiceResponse(serviceResponse, res);
 });

 localStorageRegistry.registerPath({
  method: 'get',
  path: '/localStorage/files',
  tags: ['LocalStorage'],
  responses: createApiResponse(z.array(z.object({ id: z.string(), url: z.string(), name: z.string() })), 'Success'),
 });

 router.get('/files', async (_req: Request, res: Response) => {
  const serviceResponse = await localStorageService.listFiles();
  handleServiceResponse(serviceResponse, res);
 });

 localStorageRegistry.registerPath({
  method: 'get',
  path: '/localStorage/{id}',
  tags: ['LocalStorage'],
  request: { params: z.object({ id: z.string() }) },
  responses: {
   200: createApiResponse(z.unknown(), 'Success'),
   404: createApiResponse(z.unknown(), 'Not Found'),
  },
 });

 router.get('/:id', async (req: Request, res: Response) => {
  try {
   const { id } = req.params;
   const file = await localStorageService.getFile(id);

   if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
   }

   res.setHeader('Content-Type', file.reference.mimetype || 'application/octet-stream');
   file.stream.pipe(res);
  } catch (error) {
   logger.error(`Error getting file: ${(error as Error).message}`);
   res.status(500).json({ error: 'Failed to get file' });
  }
 });

 localStorageRegistry.registerPath({
  method: 'delete',
  path: '/localStorage/all',
  tags: ['LocalStorage'],
  responses: createApiResponse(z.number(), 'All files deleted'),
 });

 router.delete('/all', async (req: Request, res: Response) => {
  const folder = req.query.folder as string | undefined;
  const serviceResponse = await localStorageService.deleteAllFiles(folder);
  handleServiceResponse(serviceResponse, res);
 });

 localStorageRegistry.registerPath({
  method: 'delete',
  path: '/localStorage/{id}',
  tags: ['LocalStorage'],
  request: { params: z.object({ id: z.string() }) },
  responses: createApiResponse(z.boolean(), 'Success'),
 });

 router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const serviceResponse = await localStorageService.deleteFile(id);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
