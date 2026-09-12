import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

import {
 addTopicsSchema,
 createGoalSchema,
 deleteGoalSchema,
 getGoalSchema,
 GoalSchema,
 logStudySchema,
 removeTopicSchema,
 setDeadlineSchema,
 setTopicCourseSchema,
 suggestCoursesSchema,
 suggestTopicsSchema,
 updateTopicEstimateSchema,
} from './goalsModel';
import { goalsService } from './goalsService';

export const goalsRegistry = new OpenAPIRegistry();

goalsRegistry.register('Goal', GoalSchema);

export const goalsRouter: Router = (() => {
 const router = express.Router();

 goalsRegistry.registerPath({
  method: 'get',
  path: '/goals',
  tags: ['Goals'],
  responses: createApiResponse(GoalSchema.array(), 'Success'),
 });

 router.get('/', async (_req: Request, res: Response) => {
  const serviceResponse = await goalsService.listGoals();
  handleServiceResponse(serviceResponse, res);
 });

 goalsRegistry.registerPath({
  method: 'post',
  path: '/goals',
  tags: ['Goals'],
  request: {
   body: { content: { 'application/json': { schema: createGoalSchema.shape.body } }, required: true },
  },
  responses: createApiResponse(GoalSchema, 'Success'),
 });

 router.post('/', validateRequest(createGoalSchema), async (req: Request, res: Response) => {
  const { title, targetDeadline } = req.body;
  const serviceResponse = await goalsService.createGoal(title, targetDeadline);
  handleServiceResponse(serviceResponse, res);
 });

 goalsRegistry.registerPath({
  method: 'get',
  path: '/goals/{id}',
  tags: ['Goals'],
  request: { params: getGoalSchema.shape.params },
  responses: createApiResponse(GoalSchema, 'Success'),
 });

 router.get('/:id', validateRequest(getGoalSchema), async (req: Request, res: Response) => {
  const serviceResponse = await goalsService.getGoal(req.params.id);
  handleServiceResponse(serviceResponse, res);
 });

 goalsRegistry.registerPath({
  method: 'delete',
  path: '/goals/{id}',
  tags: ['Goals'],
  request: { params: deleteGoalSchema.shape.params },
  responses: createApiResponse(GoalSchema, 'Success'),
 });

 router.delete('/:id', validateRequest(deleteGoalSchema), async (req: Request, res: Response) => {
  const serviceResponse = await goalsService.deleteGoal(req.params.id);
  handleServiceResponse(serviceResponse, res);
 });

 router.post('/:id/suggest-topics', validateRequest(suggestTopicsSchema), async (req: Request, res: Response) => {
  const { count, provider } = req.body ?? {};
  const serviceResponse = await goalsService.suggestTopics(req.params.id, count, provider);
  handleServiceResponse(serviceResponse, res);
 });

 router.post('/:id/topics', validateRequest(addTopicsSchema), async (req: Request, res: Response) => {
  const serviceResponse = await goalsService.addTopics(req.params.id, req.body.topics);
  handleServiceResponse(serviceResponse, res);
 });

 router.delete('/:id/topics/:topicIndex', validateRequest(removeTopicSchema), async (req: Request, res: Response) => {
  const topicIndex = Number(req.params.topicIndex);
  const serviceResponse = await goalsService.removeTopic(req.params.id, topicIndex);
  handleServiceResponse(serviceResponse, res);
 });

 router.get(
  '/:id/topics/:topicIndex/suggest-courses',
  validateRequest(suggestCoursesSchema),
  async (req: Request, res: Response) => {
   const topicIndex = Number(req.params.topicIndex);
   const q = req.query.q as string | undefined;
   const serviceResponse = await goalsService.suggestCourses(req.params.id, topicIndex, q);
   handleServiceResponse(serviceResponse, res);
  }
 );

 router.put(
  '/:id/topics/:topicIndex/course',
  validateRequest(setTopicCourseSchema),
  async (req: Request, res: Response) => {
   const topicIndex = Number(req.params.topicIndex);
   const { course, estimatedHours } = req.body;
   const serviceResponse = await goalsService.setTopicCourse(req.params.id, topicIndex, course, estimatedHours);
   handleServiceResponse(serviceResponse, res);
  }
 );

 router.put(
  '/:id/topics/:topicIndex/estimate',
  validateRequest(updateTopicEstimateSchema),
  async (req: Request, res: Response) => {
   const topicIndex = Number(req.params.topicIndex);
   const serviceResponse = await goalsService.updateTopicEstimate(req.params.id, topicIndex, req.body.estimatedHours);
   handleServiceResponse(serviceResponse, res);
  }
 );

 goalsRegistry.registerPath({
  method: 'post',
  path: '/goals/{id}/log',
  tags: ['Goals'],
  request: {
   params: logStudySchema.shape.params,
   body: { content: { 'application/json': { schema: logStudySchema.shape.body } }, required: true },
  },
  responses: createApiResponse(GoalSchema, 'Success'),
 });

 router.post('/:id/log', validateRequest(logStudySchema), async (req: Request, res: Response) => {
  const serviceResponse = await goalsService.logStudy(req.params.id, req.body);
  handleServiceResponse(serviceResponse, res);
 });

 router.put('/:id/deadline', validateRequest(setDeadlineSchema), async (req: Request, res: Response) => {
  const serviceResponse = await goalsService.setDeadline(req.params.id, req.body.targetDeadline);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
