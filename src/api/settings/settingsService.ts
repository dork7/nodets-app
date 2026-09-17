import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

import { SettingItem } from './settingsModel';
import { createSettingsRepository } from './settingsRepository';

const isDuplicateKeyError = (ex: unknown): boolean => (ex as { code?: number })?.code === 11000;

export const createSettingsService = (
 repository: ReturnType<typeof createSettingsRepository>,
 entityLabel: string
) => ({
 findAll: async (): Promise<ServiceResponse<SettingItem[] | null>> => {
  try {
   const items = await repository.findAllAsync();
   return new ServiceResponse<SettingItem[]>(ResponseStatus.Success, `${entityLabel}s found`, items, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding ${entityLabel}s: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 add: async (name: string): Promise<ServiceResponse<SettingItem | null>> => {
  try {
   const created = await repository.addAsync(name);
   return new ServiceResponse<SettingItem>(
    ResponseStatus.Success,
    `${entityLabel} created`,
    created,
    StatusCodes.CREATED
   );
  } catch (ex) {
   if (isDuplicateKeyError(ex)) {
    return new ServiceResponse(ResponseStatus.Failed, `${entityLabel} already exists`, null, StatusCodes.CONFLICT);
   }
   const errorMessage = `Cannot create ${entityLabel}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 delete: async (id: string): Promise<ServiceResponse<boolean | null>> => {
  try {
   const deleted = await repository.deleteAsync(id);
   if (!deleted) {
    return new ServiceResponse(ResponseStatus.Failed, `${entityLabel} not found`, null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<boolean>(ResponseStatus.Success, `${entityLabel} deleted`, deleted, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot delete ${entityLabel} with id ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },
});
