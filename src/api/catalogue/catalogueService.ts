import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

import { Catalogue } from './catalogueModel';
import { catalogueRepository } from './catalogueRepository';

export const catalogueService = {
 // Retrieves all catalogue from the database
 findAll: async (): Promise<ServiceResponse<Catalogue[] | null>> => {
  try {
   const catalogue = await catalogueRepository.findAllAsync();
   if (!catalogue) {
    return new ServiceResponse(ResponseStatus.Failed, 'No catalogue found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<Catalogue[]>(ResponseStatus.Success, 'catalogue found', catalogue, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding all catalogue: $${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Retrieves a single catalogue by their ID
 findById: async (id: number): Promise<ServiceResponse<Catalogue | null>> => {
  try {
   const catalogue = await catalogueRepository.findByIdAsync(id);
   if (!catalogue) {
    return new ServiceResponse<null>(ResponseStatus.Failed, 'catalogue not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<Catalogue>(ResponseStatus.Success, 'catalogue found', catalogue, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding catalogue with id ${id}:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Adds a single catalogue
 add: async (catalogue: Catalogue): Promise<ServiceResponse<Catalogue[] | null>> => {
  try {
   const catalogueAdded: Catalogue[] | null = await catalogueRepository.addAsync(catalogue);
   if (!catalogueAdded) {
    return new ServiceResponse(ResponseStatus.Failed, 'catalogue not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<Catalogue[]>(ResponseStatus.Success, 'catalogue found', catalogueAdded, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot add catalogue:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Adds a single catalogue
 delete: async (id: number): Promise<ServiceResponse<boolean | null>> => {
  try {
   const catalogueDeleted: boolean = await catalogueRepository.deleteAsync(id);
   if (!catalogueDeleted) {
    return new ServiceResponse(ResponseStatus.Failed, 'catalogue not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<boolean>(ResponseStatus.Success, 'catalogue deleted', catalogueDeleted, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot delete catalogue:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 deleteAll: async (): Promise<ServiceResponse<boolean | null>> => {
  try {
   const catalogueDeleted: boolean = await catalogueRepository.deleteAllAsync();
   if (!catalogueDeleted) {
    return new ServiceResponse(ResponseStatus.Failed, 'catalogue not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<boolean>(ResponseStatus.Success, 'catalogue deleted', catalogueDeleted, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot delete catalogue:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
