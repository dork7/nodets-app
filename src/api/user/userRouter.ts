import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { AddUserSchema, DeleteUserSchema, GetUserSchema, UserSchema } from '@/api/user/userModel';
import { userService } from '@/api/user/userService';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { userMiddleWare } from '@/common/middleware/users';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

export const userRegistry = new OpenAPIRegistry();

userRegistry.register('User', UserSchema);

export const userRouter: Router = (() => {
 const router = express.Router();

 userRegistry.registerPath({
  method: 'get',
  path: '/users',
  tags: ['User'],
  responses: createApiResponse(z.array(UserSchema), 'Success'),
 });
 const middlewareFunc = () => {
  return 'middlewareFunc passed into the middleware';
 };

 router.get('/', userMiddleWare(middlewareFunc), async (_req: Request, res: Response) => {
  const serviceResponse = await userService.findAll();
  handleServiceResponse(serviceResponse, res);
 });

 userRegistry.registerPath({
  method: 'get',
  path: '/users/{id}',
  tags: ['User'],
  request: { params: GetUserSchema.shape.params },
  responses: createApiResponse(UserSchema, 'Success'),
 });

 router.get('/:id', validateRequest(GetUserSchema), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const serviceResponse = await userService.findById(id);
  handleServiceResponse(serviceResponse, res);
 });

 userRegistry.registerPath({
  method: 'post',
  path: '/users',
  tags: ['User'],
  request: {
   body: {
    content: { 'application/json': { schema: AddUserSchema.shape.body } },
    description: 'AddUserSchema',
    required: true,
   },
  },
  responses: createApiResponse(UserSchema, 'Success'),
 });

 router.post('/', validateRequest(AddUserSchema), async (req: Request, res: Response) => {
  const user = req.body;
  const serviceResponse = await userService.addUser(user);
  handleServiceResponse(serviceResponse, res);
 });

 userRegistry.registerPath({
  method: 'delete',
  path: '/users/all',
  tags: ['User'],
  responses: createApiResponse(UserSchema, 'Success'),
 });

 router.delete('/all', async (req: Request, res: Response) => {
  const serviceResponse = await userService.deleteAllUser();
  handleServiceResponse(serviceResponse, res);
 });

 userRegistry.registerPath({
  method: 'delete',
  path: '/users/{id}',
  tags: ['User'],
  request: { params: DeleteUserSchema.shape.params },
  responses: createApiResponse(UserSchema, 'Success'),
 });

 router.delete('/:id', validateRequest(DeleteUserSchema), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const serviceResponse = await userService.deleteUser(id);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
