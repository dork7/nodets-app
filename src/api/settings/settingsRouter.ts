import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';
import { ResourceModel } from '@/models/resource.model';
import { TagModel } from '@/models/tag.model';

import { AddSettingItemSchema, DeleteSettingItemSchema, SettingItemSchema } from './settingsModel';
import { createSettingsRepository } from './settingsRepository';
import { createSettingsService } from './settingsService';

export const settingsRegistry = new OpenAPIRegistry();

settingsRegistry.register('SettingItem', SettingItemSchema);

const tagsService = createSettingsService(createSettingsRepository(TagModel), 'Tag');
const resourcesService = createSettingsService(createSettingsRepository(ResourceModel), 'Resource');

const registerSettingItemRoutes = (router: Router, path: 'tags' | 'resources', service: typeof tagsService) => {
 settingsRegistry.registerPath({
  method: 'get',
  path: `/settings/${path}`,
  tags: ['Settings'],
  responses: createApiResponse(z.array(SettingItemSchema), 'Success'),
 });

 router.get(`/${path}`, async (_req: Request, res: Response) => {
  handleServiceResponse(await service.findAll(), res);
 });

 settingsRegistry.registerPath({
  method: 'post',
  path: `/settings/${path}`,
  tags: ['Settings'],
  request: {
   body: {
    content: { 'application/json': { schema: AddSettingItemSchema.shape.body } },
    description: 'AddSettingItemSchema',
    required: true,
   },
  },
  responses: createApiResponse(SettingItemSchema, 'Success'),
 });

 router.post(`/${path}`, validateRequest(AddSettingItemSchema), async (req: Request, res: Response) => {
  handleServiceResponse(await service.add(req.body.name), res);
 });

 settingsRegistry.registerPath({
  method: 'delete',
  path: `/settings/${path}/{id}`,
  tags: ['Settings'],
  request: { params: DeleteSettingItemSchema.shape.params },
  responses: createApiResponse(SettingItemSchema, 'Success'),
 });

 router.delete(`/${path}/:id`, validateRequest(DeleteSettingItemSchema), async (req: Request, res: Response) => {
  handleServiceResponse(await service.delete(req.params.id), res);
 });
};

export const settingsRouter: Router = (() => {
 const router = express.Router();

 registerSettingItemRoutes(router, 'tags', tagsService);
 registerSettingItemRoutes(router, 'resources', resourcesService);

 return router;
})();
