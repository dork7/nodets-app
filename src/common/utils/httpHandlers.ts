import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodError, ZodSchema } from 'zod';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';

import { sendSlackMessage } from './slack';

export const handleServiceResponse = (serviceResponse: ServiceResponse<any>, response: Response) => {
 if (!serviceResponse.success) {
  sendSlackMessage(serviceResponse.stack ?? serviceResponse.message);
 }
 return response.status(serviceResponse.statusCode).send(serviceResponse);
};

export const validateRequest = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
 try {
  schema.parse({ body: req.body, query: req.query, params: req.params });
  next();
 } catch (err) {
  const errorMessage = `Invalid input: ${(err as ZodError).errors.map((e) => `${e.path} ${e.message}`).join(', ')}`;
  const statusCode = StatusCodes.BAD_REQUEST;
  res.status(statusCode).send(new ServiceResponse<null>(ResponseStatus.Failed, errorMessage, null, statusCode));
 }
};

export const validateExternalAPIResponse = (schema: ZodSchema, data: any) => {
 try {
  schema.parse(data);
 } catch (err) {
  const errorMessage = `Invalid input: ${(err as ZodError).errors.map((e) => `${e.path} ${e.message}`).join(', ')}`;
  throw new Error(errorMessage);
 }
};
