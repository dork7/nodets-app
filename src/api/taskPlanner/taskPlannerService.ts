import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

import { TaskPlanner } from './taskPlannerModel';
import { taskPlannerRepository } from './taskPlannerRepository';

export const taskPlannerService = {
 findAll: async (): Promise<ServiceResponse<TaskPlanner[] | null>> => {
  try {
   const tasks = await taskPlannerRepository.findAllAsync();
   return new ServiceResponse<TaskPlanner[]>(ResponseStatus.Success, 'Tasks found', tasks, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding tasks: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 findById: async (id: string): Promise<ServiceResponse<TaskPlanner | null>> => {
  try {
   const task = await taskPlannerRepository.findByIdAsync(id);
   if (!task) {
    return new ServiceResponse(ResponseStatus.Failed, 'Task not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<TaskPlanner>(ResponseStatus.Success, 'Task found', task, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding task with id ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 add: async (
  task: Omit<TaskPlanner, 'id' | 'createdAt' | 'updatedAt'>
 ): Promise<ServiceResponse<TaskPlanner | null>> => {
  if (task.endDate < task.startDate) {
   return new ServiceResponse(
    ResponseStatus.Failed,
    'endDate must be on or after startDate',
    null,
    StatusCodes.BAD_REQUEST
   );
  }
  try {
   const created = await taskPlannerRepository.addAsync(task);
   return new ServiceResponse<TaskPlanner>(ResponseStatus.Success, 'Task created', created, StatusCodes.CREATED);
  } catch (ex) {
   const errorMessage = `Cannot create task: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 update: async (
  id: string,
  updates: Partial<Omit<TaskPlanner, 'id' | 'createdAt' | 'updatedAt'>>
 ): Promise<ServiceResponse<TaskPlanner | null>> => {
  if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) {
   return new ServiceResponse(
    ResponseStatus.Failed,
    'endDate must be on or after startDate',
    null,
    StatusCodes.BAD_REQUEST
   );
  }
  try {
   const updated = await taskPlannerRepository.updateAsync(id, updates);
   if (!updated) {
    return new ServiceResponse(ResponseStatus.Failed, 'Task not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<TaskPlanner>(ResponseStatus.Success, 'Task updated', updated, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot update task with id ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 delete: async (id: string): Promise<ServiceResponse<boolean | null>> => {
  try {
   const deleted = await taskPlannerRepository.deleteAsync(id);
   if (!deleted) {
    return new ServiceResponse(ResponseStatus.Failed, 'Task not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<boolean>(ResponseStatus.Success, 'Task deleted', deleted, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot delete task with id ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },
};
