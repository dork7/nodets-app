import { z } from 'zod';

export enum ResponseStatus {
 Success,
 Failed,
}

export class ServiceResponse<T = null> {
 success: boolean;
 message: string;
 responseObject: T;
 statusCode: number;
 stack?: any;

 constructor(status: ResponseStatus, message: string, responseObject: T, statusCode: number, err?: any) {
  this.success = status === ResponseStatus.Success;
  this.message = message;
  this.responseObject = responseObject;
  this.statusCode = statusCode;
  this.stack = err?.stack;
 }
}

export const ServiceResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
 z.object({
  success: z.boolean(),
  message: z.string(),
  responseObject: dataSchema.optional(),
  statusCode: z.number(),
 });
