import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

import { IRedis } from './redisModel';
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

 getDataById: async (key: string): Promise<ServiceResponse<IRedis | null>> => {
  try {
   const dataSet: IRedis | null = await redisRepository.getDataByID(key);
   if (!dataSet) {
    return new ServiceResponse(ResponseStatus.Failed, 'Data not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<IRedis>(ResponseStatus.Success, 'ok', dataSet, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot add data into redis:, ${(ex as Error).message} , ${key}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 deleteDataById: async (key: string): Promise<ServiceResponse<number | null>> => {
  try {
   const dataSet: number = await redisRepository.deleteDataByID(key);
   if (!dataSet) {
    return new ServiceResponse(ResponseStatus.Failed, 'Data not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<number>(ResponseStatus.Success, 'ok', dataSet, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot add data into redis:, ${(ex as Error).message} , ${key}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 updateDataById: async (key: string, dataSet: any = 'test'): Promise<ServiceResponse<string | null>> => {
   try {
    const dataStored: string | null = await redisRepository.updateDataByID(key, dataSet);
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
};
