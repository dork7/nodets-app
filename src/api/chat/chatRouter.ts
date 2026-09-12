import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { ChatRequestSchema, ChatResponseSchema } from '@/api/chat/chatModel';
import { chatService } from '@/api/chat/chatService';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

extendZodWithOpenApi(z);

export const chatRegistry = new OpenAPIRegistry();

chatRegistry.registerPath({
 method: 'post',
 path: '/ai/chat',
 tags: ['Chat'],
 request: {
  body: {
   content: { 'application/json': { schema: ChatRequestSchema.shape.body } },
   description: 'Send one or more messages to the AI and get a reply.',
  },
 },
 responses: createApiResponse(ChatResponseSchema, 'Message processed successfully.'),
});

export const chatRouter: Router = (() => {
 const router = express.Router();

 router.post('/chat', validateRequest(ChatRequestSchema), async (req: Request, res: Response) => {
  const { messages, prompt, provider, model, temperature } = req.body;

  const serviceResponse = await chatService.sendMessages({
   messages,
   prompt,
   provider,
   model,
   temperature,
  });

  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
