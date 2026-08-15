import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';

import { getAIProviders } from './aiProvidersService';

extendZodWithOpenApi(z);

export const aiProvidersRegistry = new OpenAPIRegistry();

const AIProviderSchema = z.object({
 name: z.string(),
 baseURL: z.string(),
});

export const aiProvidersRouter: Router = (() => {
 const router = express.Router();

 aiProvidersRegistry.register('AIProvider', AIProviderSchema);

 aiProvidersRegistry.registerPath({
  method: 'get',
  path: '/aiProviders',
  tags: ['AI Providers'],
  responses: createApiResponse(z.array(AIProviderSchema), 'Success'),
 });

 router.get('/', (_req: Request, res: Response) => {
  const providers = getAIProviders();
  const serviceResponse = new ServiceResponse(
   ResponseStatus.Success,
   'Available AI providers',
   providers,
   StatusCodes.OK
  );
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
