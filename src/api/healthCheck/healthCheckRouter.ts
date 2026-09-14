import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { handleServiceResponse } from '@/common/utils/httpHandlers';

export const healthCheckRegistry = new OpenAPIRegistry();

export const healthCheckRouter: Router = (() => {
  const router = express.Router();

  healthCheckRegistry.registerPath({
    method: 'get',
    path: '/health-check',
    tags: ['Health Check'],
    responses: createApiResponse(z.null(), 'Success'),
  });

  router.get('/', (_req: Request, res: Response) => {
    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'Service is healthy', null, StatusCodes.OK);
    handleServiceResponse(serviceResponse, res);
  });

  healthCheckRegistry.registerPath({
    method: 'get',
    path: '/health-check/db',
    tags: ['Health Check'],
    responses: createApiResponse(z.null(), 'Success'),
  });

  router.get('/db', async (_req: Request, res: Response) => {
    const connection = mongoose.createConnection(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    // Without this, an unhandled 'error' event on the connection crashes the process (default EventEmitter behavior).
    connection.on('error', () => {});

    try {
      await connection.asPromise();
      await connection.db?.admin().ping();
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Success,
        'MongoDB connection successful',
        null,
        StatusCodes.OK
      );
      handleServiceResponse(serviceResponse, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        `MongoDB connection failed: ${message}`,
        null,
        StatusCodes.SERVICE_UNAVAILABLE
      );
      handleServiceResponse(serviceResponse, res);
    } finally {
      await connection.close().catch(() => {});
    }
  });

  return router;
})();
