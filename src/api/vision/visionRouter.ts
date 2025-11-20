import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ImageDetailsSchema } from '@/api/vision/visionModel';
import { visionService } from '@/api/vision/visionService';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';

export const visionRegistry = new OpenAPIRegistry();

const upload = multer({
 storage: multer.memoryStorage(),
 limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
 fileFilter: (_req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
   return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
  }
  cb(null, true);
 },
});

const multipartSchema = z.object({
 image: z.any(),
 prompt: z.string().optional(),
});

visionRegistry.registerPath({
 method: 'post',
 path: '/vision/analyze',
 tags: ['Vision'],
 request: {
  body: {
   content: {
    'multipart/form-data': {
     schema: multipartSchema,
    },
   },
  },
 },
 responses: createApiResponse(ImageDetailsSchema, 'Image details extracted successfully.'),
});

export const visionRouter: Router = (() => {
 const router = express.Router();
 const singleUpload = upload.single('image');

 router.post('/analyze', (req: Request, res: Response) => {
  singleUpload(req, res, async (err: unknown) => {
   if (err) {
    const errorMessage =
     err instanceof multer.MulterError ? err.message : 'Unable to process the uploaded image.';
    const statusCode =
     err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? StatusCodes.PAYLOAD_TOO_LARGE
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

   const serviceResponse = await visionService.extractImageDetails(
    req.file as Express.Multer.File | undefined,
    (req.body?.prompt as string | undefined) ?? undefined
   );

   handleServiceResponse(serviceResponse, res);
  });
 });

 return router;
})();

