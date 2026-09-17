import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

import { TaskPlanner } from './taskPlannerModel';
import { taskPlannerRepository } from './taskPlannerRepository';

export const taskPlannerService = {
 findAll: async (): Promise<ServiceResponse<TaskPlanner[] | null>> => {
  try {
   const projects = await taskPlannerRepository.findAllAsync();
   return new ServiceResponse<TaskPlanner[]>(ResponseStatus.Success, 'Projects found', projects, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding projects: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 findById: async (id: string): Promise<ServiceResponse<TaskPlanner | null>> => {
  try {
   const project = await taskPlannerRepository.findByIdAsync(id);
   if (!project) {
    return new ServiceResponse(ResponseStatus.Failed, 'Project not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<TaskPlanner>(ResponseStatus.Success, 'Project found', project, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding project with id ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 add: async (
  project: Omit<TaskPlanner, 'id' | 'createdAt' | 'updatedAt'>
 ): Promise<ServiceResponse<TaskPlanner | null>> => {
  if (project.endDate < project.startDate) {
   return new ServiceResponse(
    ResponseStatus.Failed,
    'endDate must be on or after startDate',
    null,
    StatusCodes.BAD_REQUEST
   );
  }
  try {
   const created = await taskPlannerRepository.addAsync(project);
   return new ServiceResponse<TaskPlanner>(ResponseStatus.Success, 'Project created', created, StatusCodes.CREATED);
  } catch (ex) {
   const errorMessage = `Cannot create project: ${(ex as Error).message}`;
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
  // Marking a project Done implies full progress unless the caller says otherwise.
  if (updates.status === 'Done' && updates.progress === undefined) {
   updates.progress = 100;
  }
  try {
   const updated = await taskPlannerRepository.updateAsync(id, updates);
   if (!updated) {
    return new ServiceResponse(ResponseStatus.Failed, 'Project not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<TaskPlanner>(ResponseStatus.Success, 'Project updated', updated, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot update project with id ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },

 delete: async (id: string): Promise<ServiceResponse<boolean | null>> => {
  try {
   const deleted = await taskPlannerRepository.deleteAsync(id);
   if (!deleted) {
    return new ServiceResponse(ResponseStatus.Failed, 'Project not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<boolean>(ResponseStatus.Success, 'Project deleted', deleted, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot delete project with id ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR, ex);
  }
 },
};
