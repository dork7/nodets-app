import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { z } from 'zod';

import { LayaClassifyTicketResponseSchema, LayaClassifyTicketSchema } from '@/api/laya/model';
import { layaService } from '@/api/laya/service';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { handleServiceResponse, validateRequest } from '@/common/utils/httpHandlers';

extendZodWithOpenApi(z);

export const layaRegistry = new OpenAPIRegistry();

layaRegistry.registerPath({
 method: 'post',
 path: '/laya/classify-ticket',
 tags: ['Laya'],
 request: {
  body: {
   content: { 'application/json': { schema: LayaClassifyTicketSchema.shape.body } },
   description: 'Classify a support ticket by department, urgency, and refund risk',
   required: true,
  },
 },
 responses: createApiResponse(LayaClassifyTicketResponseSchema, 'Success'),
});

export const layaRouter: Router = (() => {
 const router = express.Router();

 router.post('/classify-ticket', validateRequest(LayaClassifyTicketSchema), async (req: Request, res: Response) => {
  const { subject, body, questions } = req.body;
  const serviceResponse = await layaService.classifyTicket({ subject, body }, questions);
  handleServiceResponse(serviceResponse, res);
 });

 return router;
})();
