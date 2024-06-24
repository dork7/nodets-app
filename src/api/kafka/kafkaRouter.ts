import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

import { KafkaSchema, PostKafkaSchema } from './kafkaModel';
import { kafkaService } from './kafkaService';

export const kafkaRegistry = new OpenAPIRegistry();

kafkaRegistry.register('Kafka', KafkaSchema);

export const kafkaRouter: Router = (() => {
 const router = express.Router();

 //  kafkaRegistry.registerPath({
 //   method: 'get',
 //   path: '/kafka/getMessages/{topic}',
 //   tags: ['Kafka'],
 //   request: { params: GetUserSchema.shape.params },
 //   responses: createApiResponse(KafkaSchema, 'Success'),
 //  });

 //  router.get('/getMessages/:topic', validateRequest(GetKafkaSchema), async (req: Request, res: Response) => {
 //   const { topic } = req.params;
 //   const serviceResponse = await kafkaService.getMessageByTopic(topic);
 //   handleServiceResponse(serviceResponse, res);
 //  });

 kafkaRegistry.registerPath({
  method: 'post',
  path: '/kafka/postMessage',
  tags: ['Kafka'],
  request: {
   body: {
    content: { 'application/json': { schema: PostKafkaSchema.shape.body } },
    description: 'PostKafkaSchema',
    required: true,
   },
  },
  responses: createApiResponse(KafkaSchema, 'Success'),
 });

 router.post('/postMessage', validateRequest(PostKafkaSchema), async (req: Request, res: Response) => {
  const kafkaMessage = req.body;
  const serviceResponse = await kafkaService.postMessage(kafkaMessage);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
