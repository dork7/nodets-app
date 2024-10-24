import { Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { sendKafkaMessage } from '@/common/utils/kafkaService';
import { logger } from '@/server';

import { TKafka } from './kafkaModel';

export const kafkaService = {
 // Retrieves a single user by their ID
 //  getMessageByTopic: async (topic: string): Promise<ServiceResponse<any>> => {
 //   try {
 //    const user = await readKafkaMessage(topic);
 //    if (!user) {
 //     return new ServiceResponse(ResponseStatus.Failed, 'User not found', null, StatusCodes.NOT_FOUND);
 //    }
 //    return new ServiceResponse<User>(ResponseStatus.Success, 'User found', user, StatusCodes.OK);
 //   } catch (ex) {
 //    const errorMessage = `Error finding user with id ${id}:, ${(ex as Error).message}`;
 //    logger.error(errorMessage);
 //    return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
 //   }
 //  },

 // Adds a single user
 postMessage: async (kafkaBody: TKafka, res: Response): Promise<ServiceResponse<any>> => {
  try {
   const correlationId = res.getHeaders()['x-request-id'] as string;
   //    Array(10000)
   //     .fill(0)
   //     .forEach((_, idx) => {
   //      sendKafkaMessage(topic, idx, correlationId);
   //     });
   const dataSent: any = await sendKafkaMessage(kafkaBody, correlationId);
   if (!dataSent) {
    return new ServiceResponse(ResponseStatus.Failed, 'Unable to send message', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<any>(ResponseStatus.Success, 'Message sent', dataSent, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Unable to send message, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
