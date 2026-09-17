import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

import {
 AddTaskPlannerSchema,
 DeleteTaskPlannerSchema,
 GetTaskPlannerSchema,
 TaskPlannerSchema,
 UpdateTaskPlannerSchema,
} from './taskPlannerModel';
import { taskPlannerService } from './taskPlannerService';

export const taskPlannerRegistry = new OpenAPIRegistry();

taskPlannerRegistry.register('Project', TaskPlannerSchema);

export const taskPlannerRouter: Router = (() => {
 const router = express.Router();

 // The global helmet() CSP is `script-src 'self'`, which blocks this page's
 // inline bootstrap script. Relax it for the timeline HTML only (JSON API
 // routes below keep the strict global policy).
 router.get('/dashboard', (_req: Request, res: Response) => {
  res.setHeader(
   'Content-Security-Policy',
   [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
   ].join('; ')
  );
  res.render('taskPlanner');
 });

 taskPlannerRegistry.registerPath({
  method: 'get',
  path: '/taskPlanner',
  tags: ['Projects'],
  responses: createApiResponse(z.array(TaskPlannerSchema), 'Success'),
 });

 router.get('/', async (_req: Request, res: Response) => {
  const serviceResponse = await taskPlannerService.findAll();
  handleServiceResponse(serviceResponse, res);
 });

 taskPlannerRegistry.registerPath({
  method: 'get',
  path: '/taskPlanner/{id}',
  tags: ['Projects'],
  request: { params: GetTaskPlannerSchema.shape.params },
  responses: createApiResponse(TaskPlannerSchema, 'Success'),
 });

 router.get('/:id', validateRequest(GetTaskPlannerSchema), async (req: Request, res: Response) => {
  const serviceResponse = await taskPlannerService.findById(req.params.id);
  handleServiceResponse(serviceResponse, res);
 });

 taskPlannerRegistry.registerPath({
  method: 'post',
  path: '/taskPlanner',
  tags: ['Projects'],
  request: {
   body: {
    content: { 'application/json': { schema: AddTaskPlannerSchema.shape.body } },
    description: 'AddTaskPlannerSchema',
    required: true,
   },
  },
  responses: createApiResponse(TaskPlannerSchema, 'Success'),
 });

 router.post('/', validateRequest(AddTaskPlannerSchema), async (req: Request, res: Response) => {
  const serviceResponse = await taskPlannerService.add(req.body);
  handleServiceResponse(serviceResponse, res);
 });

 taskPlannerRegistry.registerPath({
  method: 'put',
  path: '/taskPlanner/{id}',
  tags: ['Projects'],
  request: {
   params: UpdateTaskPlannerSchema.shape.params,
   body: {
    content: { 'application/json': { schema: UpdateTaskPlannerSchema.shape.body } },
    description: 'UpdateTaskPlannerSchema',
    required: true,
   },
  },
  responses: createApiResponse(TaskPlannerSchema, 'Success'),
 });

 router.put('/:id', validateRequest(UpdateTaskPlannerSchema), async (req: Request, res: Response) => {
  const serviceResponse = await taskPlannerService.update(req.params.id, req.body);
  handleServiceResponse(serviceResponse, res);
 });

 taskPlannerRegistry.registerPath({
  method: 'delete',
  path: '/taskPlanner/{id}',
  tags: ['Projects'],
  request: { params: DeleteTaskPlannerSchema.shape.params },
  responses: createApiResponse(TaskPlannerSchema, 'Success'),
 });

 router.delete('/:id', validateRequest(DeleteTaskPlannerSchema), async (req: Request, res: Response) => {
  const serviceResponse = await taskPlannerService.delete(req.params.id);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
