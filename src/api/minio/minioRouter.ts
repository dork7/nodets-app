import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';
import { logger } from '@/server';

import { minioService, minioUpload } from './minioService';

const minioRegistry = new OpenAPIRegistry();

minioRegistry.register('Minio', z.object({ id: z.string(), url: z.string(), name: z.string() }));

export const minioRouter: Router = (() => {
  const router = express.Router();

  minioRegistry.registerPath({
    method: 'post',
    path: '/minio/upload',
    tags: ['Minio'],
    requestBody: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string(),
            bucket: z.string().optional(),
          }),
        },
      },
      description: 'Upload a file to Minio',
      required: true,
    },
    responses: createApiResponse(z.object({ id: z.string(), url: z.string(), name: z.string() }), 'Success'),
  });

  router.post('/upload', minioUpload.single, async (req: Request, res: Response) => {
    if (!req.file) {
      return handleServiceResponse(
        new ServiceResponse(
          ResponseStatus.Failed,
          'No file provided',
          null,
          StatusCodes.BAD_REQUEST
        ),
        res
      );
    }
    const bucket = req.body.bucket as string | undefined;
    const serviceResponse = await minioService.uploadFile(req.file, bucket);
    handleServiceResponse(serviceResponse, res);
  });

  minioRegistry.registerPath({
    method: 'post',
    path: '/minio/upload/multiple',
    tags: ['Minio'],
    requestBody: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            files: z.array(z.string()),
            bucket: z.string().optional(),
          }),
        },
      },
      description: 'Upload multiple files to Minio',
      required: true,
    },
    responses: createApiResponse(
      z.array(z.object({ id: z.string(), url: z.string(), name: z.string() })),
      'Success'
    ),
  });

  router.post('/upload/multiple', minioUpload.multiple, async (req: Request, res: Response) => {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return handleServiceResponse(
        new ServiceResponse(
          ResponseStatus.Failed,
          'No files provided',
          null,
          StatusCodes.BAD_REQUEST
        ),
        res
      );
    }
    const bucket = req.body.bucket as string | undefined;
    const serviceResponse = await minioService.uploadMultipleFiles(req.files as Express.Multer.File[], bucket);
    handleServiceResponse(serviceResponse, res);
  });

  minioRegistry.registerPath({
    method: 'get',
    path: '/minio/files',
    tags: ['Minio'],
    responses: createApiResponse(
      z.array(z.object({ id: z.string(), url: z.string(), name: z.string() })),
      'Success'
    ),
  });

  router.get('/files', async (_req: Request, res: Response) => {
    const serviceResponse = await minioService.listFiles();
    handleServiceResponse(serviceResponse, res);
  });

  minioRegistry.registerPath({
    method: 'get',
    path: '/minio/{id}',
    tags: ['Minio'],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: createApiResponse(z.unknown(), 'Success'),
      404: createApiResponse(z.unknown(), 'Not Found'),
    },
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const bucket = req.query.bucket as string | undefined;
      
      const stream = await minioService.getFile(id, bucket);
      
      if (!stream) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      
      res.setHeader('Content-Type', 'application/octet-stream');
      stream.pipe(res);
    } catch (error) {
      logger.error(`Error getting file: ${(error as Error).message}`);
      res.status(500).json({ error: 'Failed to get file' });
    }
  });

  minioRegistry.registerPath({
    method: 'delete',
    path: '/minio/{id}',
    tags: ['Minio'],
    request: { params: z.object({ id: z.string() }) },
    responses: createApiResponse(z.boolean(), 'Success'),
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const bucket = req.query.bucket as string | undefined;
    const serviceResponse = await minioService.deleteFile(id, bucket);
    handleServiceResponse(serviceResponse, res);
  });

  return router;
})();
