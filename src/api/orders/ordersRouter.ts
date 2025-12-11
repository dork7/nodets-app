import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

import { AddOrdersSchema, DeleteOrdersSchema, GetOrdersSchema, OrdersSchema } from './ordersModel';
import { ordersService } from './ordersService';

export const ordersRegistry = new OpenAPIRegistry();

ordersRegistry.register('orders', OrdersSchema);

export const ordersRouter: Router = (() => {
 const router = express.Router();

 ordersRegistry.registerPath({
  method: 'get',
  path: '/orders',
  tags: ['orders'],
  responses: createApiResponse(z.array(OrdersSchema), 'Success'),
 });

 router.get('/', async (_req: Request, res: Response) => {
  const serviceResponse = await ordersService.findAll();
  handleServiceResponse(serviceResponse, res);
 });

 ordersRegistry.registerPath({
  method: 'get',
  path: '/orders/{id}',
  tags: ['orders'],
  request: { params: GetOrdersSchema.shape.params },
  responses: createApiResponse(OrdersSchema, 'Success'),
 });

 router.get('/:id', validateRequest(GetOrdersSchema), async (req: Request, res: Response) => {
  const id = req.params.id;
  const serviceResponse = await ordersService.findById(id);
  handleServiceResponse(serviceResponse, res);
 });

 ordersRegistry.registerPath({
  method: 'post',
  path: '/order',
  tags: ['orders'],
  request: {
   body: {
    content: { 'application/json': { schema: AddOrdersSchema.shape.body } },
    description: 'AddordersSchema',
    required: true,
   },
  },
  responses: createApiResponse(OrdersSchema, 'Success'),
 });

 router.post('/', validateRequest(AddOrdersSchema), async (req: Request, res: Response) => {
  const orders = req.body;
  const serviceResponse = await ordersService.add(orders);
  handleServiceResponse(serviceResponse, res);
 });

 ordersRegistry.registerPath({
  method: 'delete',
  path: '/order/all',
  tags: ['orders'],
  responses: createApiResponse(OrdersSchema, 'Success'),
 });

 router.delete('/all', async (req: Request, res: Response) => {
  const serviceResponse = await ordersService.deleteAll();
  handleServiceResponse(serviceResponse, res);
 });

 ordersRegistry.registerPath({
  method: 'delete',
  path: '/order/{id}',
  tags: ['orders'],
  request: { params: DeleteOrdersSchema.shape.params },
  responses: createApiResponse(OrdersSchema, 'Success'),
 });

 router.delete('/:id', validateRequest(DeleteOrdersSchema), async (req: Request, res: Response) => {
  const id = req.params.id;
  const serviceResponse = await ordersService.delete(id);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
