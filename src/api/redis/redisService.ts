import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

import { redisRepository } from './redisRepository';

export const redisService = {
 setData: async (key: string, dataSet: any = 'test'): Promise<ServiceResponse<string | null>> => {
  try {
   const dataStored: string | null = await redisRepository.storeData(key, dataSet);
   if (!dataStored) {
    return new ServiceResponse(ResponseStatus.Failed, 'Unable to set data', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<string>(ResponseStatus.Success, 'data set', dataStored, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot add data into redis:, ${(ex as Error).message} , ${key}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 getDataById: async (key: string): Promise<ServiceResponse<{} | null>> => {
  try {
   const dataSet: {} | null = await redisRepository.getDataByID(key);
   if (!dataSet) {
    return new ServiceResponse(ResponseStatus.Failed, 'Data not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<{}>(ResponseStatus.Success, 'ok', dataSet, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot add data into redis:, ${(ex as Error).message} , ${key}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
