import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { validateExternalAPIResponse } from '@/common/utils/httpHandlers';
import customAxios from '@/config/axios';
import { logger } from '@/server';

import { Catalogue, CatelogueAPIRespSchema } from './catalogueModel';
import { catalogueRepository } from './catalogueRepository';
import { CustomError } from '@/common/utils/CustomError';

export const catalogueService = {
 // Retrieves all catalogue from the database
 findAll: async (): Promise<ServiceResponse<Catalogue[] | null>> => {
  try {
   const url = `${env.PRODUCTS_API}`;
   const catalogue: any = await customAxios.get(url);
   if (catalogue.code === 'ENOTFOUND') {
    throw new CustomError({
        message: "Connection error",
        stack : catalogue.stack
    });
   }
   if (catalogue.status === StatusCodes.NOT_FOUND) {
    return new ServiceResponse<null>(ResponseStatus.Failed, 'catalogue not found', null, catalogue.status);
   }
   //    CatelogueAPIRespSchema.parse(catalogue.data);
   validateExternalAPIResponse(CatelogueAPIRespSchema.array(), catalogue.data.products);
   return new ServiceResponse<Catalogue[]>(ResponseStatus.Success, 'catalogue found', catalogue.data, catalogue.status);
  } catch (ex) {
   const errorMessage = `Error finding all catalogue: $${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 // Retrieves a single catalogue by their ID
 findById: async (id: number): Promise<ServiceResponse<Catalogue | null>> => {
  try {
   const url = `${env.PRODUCTS_API}/${id}`;
   const catalogue = await customAxios.get(url);
   if (catalogue.status === StatusCodes.NOT_FOUND) {
    return new ServiceResponse<null>(ResponseStatus.Failed, 'catalogue not found', null, catalogue.status);
   }
   //    CatelogueAPIRespSchema.parse(catalogue.data);
   validateExternalAPIResponse(CatelogueAPIRespSchema, catalogue.data);
   return new ServiceResponse<Catalogue>(ResponseStatus.Success, 'catalogue found', catalogue.data, catalogue.status);
  } catch (ex) {
   const errorMessage = `Error finding catalogue with id ${id}:, ${(ex as Error).message}`;
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 // Adds a single catalogue
 add: async (catalogue: Catalogue): Promise<ServiceResponse<Catalogue[] | null>> => {
  try {
   const catalogueAdded: Catalogue[] | null = await catalogueRepository.addAsync(catalogue);
   if (!catalogueAdded) {
    return new ServiceResponse(ResponseStatus.Failed, 'catalogue not found', null, StatusCodes.NO_CONTENT);
   }
   return new ServiceResponse<Catalogue[]>(
    ResponseStatus.Success,
    'catalogue found',
    catalogueAdded,
    StatusCodes.CREATED
   );
  } catch (ex) {
   const errorMessage = `Cannot add catalogue:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 // Adds a single catalogue
 delete: async (id: number): Promise<ServiceResponse<boolean | null>> => {
  try {
   const catalogueDeleted: boolean = await catalogueRepository.deleteAsync(id);
   if (!catalogueDeleted) {
    return new ServiceResponse(ResponseStatus.Failed, 'catalogue not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<boolean>(
    ResponseStatus.Success,
    'catalogue deleted',
    catalogueDeleted,
    StatusCodes.ACCEPTED
   );
  } catch (ex) {
   const errorMessage = `Cannot delete catalogue:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 deleteAll: async (): Promise<ServiceResponse<boolean | null>> => {
  try {
   const catalogueDeleted: boolean = await catalogueRepository.deleteAllAsync();
   if (!catalogueDeleted) {
    return new ServiceResponse(ResponseStatus.Failed, 'catalogue not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<boolean>(
    ResponseStatus.Success,
    'catalogue deleted',
    catalogueDeleted,
    StatusCodes.ACCEPTED
   );
  } catch (ex) {
   const errorMessage = `Cannot delete catalogue:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },
};
