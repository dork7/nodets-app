import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { GetUserSchema } from '@/api/user/userModel';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

import { AddCatalogueSchema, CatalogueSchema, DeleteCatalogueSchema, GetCatalogueSchema } from './catalogueModel';
import { catalogueService } from './catalogueService';

export const catalogueRegistery = new OpenAPIRegistry();

catalogueRegistery.register('Catalogue', CatalogueSchema);

export const catalogueRouter: Router = (() => {
 const router = express.Router();

 catalogueRegistery.registerPath({
  method: 'get',
  path: '/catalogue',
  tags: ['Catalogue'],
  responses: createApiResponse(z.array(CatalogueSchema), 'Success'),
 });

 router.get('/', async (_req: Request, res: Response) => {
  const serviceResponse = await catalogueService.findAll();
  handleServiceResponse(serviceResponse, res);
 });

 catalogueRegistery.registerPath({
  method: 'get',
  path: '/catalogue/{id}',
  tags: ['Catalogue'],
  request: { params: GetCatalogueSchema.shape.params },
  responses: createApiResponse(CatalogueSchema, 'Success'),
 });

 router.get('/:id', validateRequest(GetUserSchema), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const serviceResponse = await catalogueService.findById(id);
  handleServiceResponse(serviceResponse, res);
 });

 catalogueRegistery.registerPath({
  method: 'post',
  path: '/catalogue',
  tags: ['Catalogue'],
  request: {
   body: {
    content: { 'application/json': { schema: AddCatalogueSchema.shape.body } },
    description: 'AddCatalogueSchema',
    required: true,
   },
  },
  responses: createApiResponse(CatalogueSchema, 'Success'),
 });

 router.post('/', validateRequest(AddCatalogueSchema), async (req: Request, res: Response) => {
  const user = req.body;
  const serviceResponse = await catalogueService.add(user);
  handleServiceResponse(serviceResponse, res);
 });

 catalogueRegistery.registerPath({
  method: 'delete',
  path: '/catalogue/all',
  tags: ['Catalogue'],
  responses: createApiResponse(CatalogueSchema, 'Success'),
 });

 router.delete('/all', async (req: Request, res: Response) => {
  const serviceResponse = await catalogueService.deleteAll();
  handleServiceResponse(serviceResponse, res);
 });

 catalogueRegistery.registerPath({
  method: 'delete',
  path: '/catalogue/{id}',
  tags: ['Catalogue'],
  request: { params: DeleteCatalogueSchema.shape.params },
  responses: createApiResponse(CatalogueSchema, 'Success'),
 });

 router.delete('/:id', validateRequest(DeleteCatalogueSchema), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const serviceResponse = await catalogueService.delete(id);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
