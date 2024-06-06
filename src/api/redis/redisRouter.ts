import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';

import { DeleteUserSchema, UserSchema } from '@/api/user/userModel';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

import { StoreDataSchema } from './redisModel';
import { redisService } from './redisService';

export const userRegistry = new OpenAPIRegistry();

userRegistry.register('User', UserSchema);

export const redisRouter: Router = (() => {
 const router = express.Router();

 userRegistry.registerPath({
  method: 'post',
  path: '/redis/{key}',
  tags: ['RedisStoreData'],
  request: { params: DeleteUserSchema.shape.params },
  responses: createApiResponse(UserSchema, 'Success'),
 });

 router.post('/:key', validateRequest(StoreDataSchema), async (req: Request, res: Response) => {
  const key = req.params.key;
  const serviceResponse = await redisService.setData(key, req.body);
  handleServiceResponse(serviceResponse, res);
 });


 userRegistry.registerPath({
  method: 'get',
  path: '/redis/{key}',
  tags: ['RedisStoreData'],
  request: { params: DeleteUserSchema.shape.params },
  responses: createApiResponse(UserSchema, 'Success'),
 });

 router.get('/:key', validateRequest(StoreDataSchema), async (req: Request, res: Response) => {
  const key = req.params.key;
  const serviceResponse = await redisService.getDataById(key);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
