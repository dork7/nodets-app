import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

import { aiUtilsService } from './aiUtilsService';

extendZodWithOpenApi(z);

export const aiUtilsRegistry = new OpenAPIRegistry();

const GetChatHistorySchema = z.object({
 params: z.object({
  userId: z.string().min(1, 'User ID is required'),
 }),
});

const ChatHistoryResponseSchema = z.array(
 z.object({
  role: z.string(),
  content: z.string(),
 })
);

const TokenUsageResponseSchema = z.object({
 prompt_tokens: z.number().optional(),
 completion_tokens: z.number().optional(),
 total_tokens: z.number().optional(),
});

const UnloadModelResultSchema = z.object({
 model: z.string(),
 success: z.boolean(),
 message: z.string(),
});

const UnloadModelsResponseSchema = z.object({
 unloaded: z.array(z.string()),
 failed: z.array(UnloadModelResultSchema),
 results: z.array(UnloadModelResultSchema),
});

const GetTokenUsageSchema = z.object({
 params: z.object({
  userId: z.string().min(1, 'User ID is required'),
 }),
});

const LoadedModelSchema = z.object({
 model: z.string(),
 backend: z.string().optional(),
 in_memory: z.boolean().optional(),
 size: z.number().optional(),
});

const UnloadModelSchema = z.object({
 body: z.object({
  model: z.string().min(1, 'Model name is required'),
 }),
});

aiUtilsRegistry.register('ChatHistory', ChatHistoryResponseSchema);
aiUtilsRegistry.register('TokenUsage', TokenUsageResponseSchema);
aiUtilsRegistry.register('UnloadModels', UnloadModelsResponseSchema);
aiUtilsRegistry.register('LoadedModel', LoadedModelSchema);

export const aiUtilsRouter: Router = (() => {
 const router = express.Router();

 aiUtilsRegistry.registerPath({
  method: 'get',
  path: '/chat-history/{userId}',
  tags: ['AI Utils'],
  request: { params: GetChatHistorySchema.shape.params },
  responses: createApiResponse(ChatHistoryResponseSchema, 'Success'),
 });

 aiUtilsRegistry.registerPath({
  method: 'get',
  path: '/token-usage/{userId}',
  tags: ['AI Utils'],
  request: { params: GetTokenUsageSchema.shape.params },
  responses: createApiResponse(TokenUsageResponseSchema, 'Success'),
 });

 aiUtilsRegistry.registerPath({
  method: 'post',
  path: '/unload-models',
  tags: ['AI Utils'],
  responses: createApiResponse(UnloadModelsResponseSchema, 'Success'),
 });

 router.get('/chat-history/:userId', validateRequest(GetChatHistorySchema), async (req: Request, res: Response) => {
  const userId = req.params.userId;
  const serviceResponse = await aiUtilsService.getChatHistory(userId);
  handleServiceResponse(serviceResponse, res);
 });

 router.get('/token-usage/:userId', validateRequest(GetTokenUsageSchema), async (req: Request, res: Response) => {
  const userId = req.params.userId;
  const serviceResponse = await aiUtilsService.getTokenUsage(userId);
  handleServiceResponse(serviceResponse, res);
 });

 router.post('/unload-models', async (_req: Request, res: Response) => {
  const serviceResponse = await aiUtilsService.unloadLLMModels();
  handleServiceResponse(serviceResponse, res);
 });

 aiUtilsRegistry.registerPath({
  method: 'get',
  path: '/loaded-models',
  tags: ['AI Utils'],
  responses: createApiResponse(z.array(LoadedModelSchema), 'Success'),
 });

 router.get('/loaded-models', async (_req: Request, res: Response) => {
  const serviceResponse = await aiUtilsService.getLoadedModels();
  handleServiceResponse(serviceResponse, res);
 });

 aiUtilsRegistry.registerPath({
  method: 'post',
  path: '/unload-model',
  tags: ['AI Utils'],
  request: {
   body: {
    content: { 'application/json': { schema: UnloadModelSchema.shape.body } },
   },
  },
  responses: createApiResponse(UnloadModelResultSchema, 'Success'),
 });

 router.post('/unload-model', validateRequest(UnloadModelSchema), async (req: Request, res: Response) => {
  const { model } = req.body;
  const serviceResponse = await aiUtilsService.unloadModel(model);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
