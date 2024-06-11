import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

import { deleteDataSchema, getDataSchema, RedisSchema, storeDataSchema } from './redisModel';
import { redisService } from './redisService';

export const redisRegistry = new OpenAPIRegistry();

redisRegistry.register('Redis', RedisSchema);

export const redisRouter: Router = (() => {
 const router = express.Router();

 redisRegistry.registerPath({
  method: 'post',
  path: '/redis/{key}',
  tags: ['Redis'],
  request: { params: storeDataSchema.shape.params },
  responses: createApiResponse(RedisSchema, 'Success'),
 });

 router.post('/:key', validateRequest(storeDataSchema), async (req: Request, res: Response) => {
  const key = req.params.key;
  const serviceResponse = await redisService.setData(key, req.body);
  handleServiceResponse(serviceResponse, res);
 });

 redisRegistry.registerPath({
  method: 'get',
  path: '/redis/{key}',
  tags: ['Redis'],
  request: { params: getDataSchema.shape.params },
  responses: createApiResponse(RedisSchema, 'Success'),
 });

 router.get('/:key', validateRequest(getDataSchema), async (req: Request, res: Response) => {
  const key = req.params.key;
  const serviceResponse = await redisService.getDataById(key);
  handleServiceResponse(serviceResponse, res);
 });

 redisRegistry.registerPath({
  method: 'delete',
  path: '/redis/{key}',
  tags: ['Redis'],
  request: { params: getDataSchema.shape.params },
  responses: createApiResponse(RedisSchema, 'Success'),
 });

 router.delete('/:key', validateRequest(deleteDataSchema), async (req: Request, res: Response) => {
  const key = req.params.key;
  const serviceResponse = await redisService.getDataById(key);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
