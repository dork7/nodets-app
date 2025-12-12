import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';
import { redis } from '@/services/redisStore';

export const aiUtilsService = {
 async getChatHistory(userId: string): Promise<ServiceResponse<any[] | null>> {
  try {
   const history = await redis.getValue(`chat_history_${userId}`);
   const historyArray = history || [];

   if (!Array.isArray(historyArray)) {
    return new ServiceResponse(ResponseStatus.Success, 'No chat history found', [], StatusCodes.OK);
   }

   // Filter to only include user messages
   let userMessages = historyArray.filter((msg: any) => msg.role === 'user');


   if (userMessages.length === 0) {
    return new ServiceResponse(ResponseStatus.Success, 'No user messages found in chat history', [], StatusCodes.OK);
   }
   userMessages = userMessages.reverse()
   return new ServiceResponse<any[]>(
    ResponseStatus.Success,
    'Chat history retrieved successfully',
    userMessages,
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Error retrieving chat history for user ${userId}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};

