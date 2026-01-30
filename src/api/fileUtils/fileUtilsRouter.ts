import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';

import { fileUtilsService } from './fileUtilsService';

extendZodWithOpenApi(z);

export const fileUtilsRegistry = new OpenAPIRegistry();

// Schemas
const ExtractTextResponseSchema = z.object({
 text: z.string(),
 fileName: z.string(),
 fileType: z.string(),
 characterCount: z.number(),
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
fileUtilsRegistry.register('ExtractTextResponse', ExtractTextResponseSchema);

// Register paths
fileUtilsRegistry.registerPath({
 method: 'post',
 path: '/file-utils/extract-text',
 tags: ['FileUtils'],
 request: {
  body: {
   content: {
    'multipart/form-data': {
     schema: z.object({
      file: z.any(),
     }),
    },
   },
  },
 },
 responses: createApiResponse(ExtractTextResponseSchema, 'Text extracted successfully'),
});

export const fileUtilsRouter: Router = (() => {
 const router = express.Router();
 const singleUpload = upload.single('file');

 // Extract text from file endpoint
 router.post('/extract-text', (req: Request, res: Response) => {
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

   const serviceResponse = await fileUtilsService.extractText(file);
   handleServiceResponse(serviceResponse, res);
  });
 });

 return router;
})();
