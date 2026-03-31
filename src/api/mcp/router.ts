import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';
import { StatusCodes } from 'http-status-codes';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';

export const mcpRegistry = new OpenAPIRegistry();

// mcpRegistry.register('mcp', mcpSchema);

export const mcpRouter: Router = (() => {
 const router = express.Router();

 /*
 mcpRegistry.registerPath({
  method: 'get',
  path: '/mcp',
  tags: ['mcp'],
//   responses: createApiResponse(z.array(mcpSchema), 'Success'),
 });
 */

 router.get('/', async (_req: Request, res: Response) => {
  const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'Success', null, StatusCodes.OK);
  handleServiceResponse(serviceResponse, res);
 });

 /*
 mcpRegistry.registerPath({
  method: 'post',
  path: '/',
  tags: ['mcp'],
  request: {
   body: {
    content: { 'application/json': { schema: AddmcpSchema.shape.body } },
    description: 'AddmcpSchema',
    required: true,
   },
  },
  responses: createApiResponse(mcpSchema, 'Success'),
 });
 */

 router.post('/', async (req: Request, res: Response) => {
  const mcp = req.body;
  const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'Success', null, StatusCodes.OK);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();