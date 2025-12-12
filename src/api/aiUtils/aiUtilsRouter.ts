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

aiUtilsRegistry.register('ChatHistory', ChatHistoryResponseSchema);

export const aiUtilsRouter: Router = (() => {
 const router = express.Router();

 aiUtilsRegistry.registerPath({
  method: 'get',
  path: '/chat-history/{userId}',
  tags: ['AI Utils'],
  request: { params: GetChatHistorySchema.shape.params },
  responses: createApiResponse(ChatHistoryResponseSchema, 'Success'),
 });

 router.get('/chat-history/:userId', validateRequest(GetChatHistorySchema), async (req: Request, res: Response) => {
  const userId = req.params.userId;
  const serviceResponse = await aiUtilsService.getChatHistory(userId);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();

