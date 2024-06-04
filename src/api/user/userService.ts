import { StatusCodes } from 'http-status-codes';

import { User } from '@/api/user/userModel';
import { userRepository } from '@/api/user/userRepository';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

export const userService = {
  // Retrieves all users from the database
  findAll: async (): Promise<ServiceResponse<User[] | null>> => {
    try {
      const users = await userRepository.findAllAsync();
      if (!users) {
        return new ServiceResponse(ResponseStatus.Failed, 'No Users found', null, StatusCodes.NOT_FOUND);
      }
      return new ServiceResponse<User[]>(ResponseStatus.Success, 'Users found', users, StatusCodes.OK);
    } catch (ex) {
      const errorMessage = `Error finding all users: $${(ex as Error).message}`;
      logger.error(errorMessage);
      return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  },

  // Retrieves a single user by their ID
  findById: async (id: number): Promise<ServiceResponse<User | null>> => {
    try {
      const user = await userRepository.findByIdAsync(id);
      if (!user) {
        return new ServiceResponse(ResponseStatus.Failed, 'User not found', null, StatusCodes.NOT_FOUND);
      }
      return new ServiceResponse<User>(ResponseStatus.Success, 'User found', user, StatusCodes.OK);
    } catch (ex) {
      const errorMessage = `Error finding user with id ${id}:, ${(ex as Error).message}`;
      logger.error(errorMessage);
      return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  },

  // Adds a single user
  addUser: async (user: User): Promise<ServiceResponse<User[] | null>> => {
    try {
      const userAdded: User[] | null = await userRepository.addUserAsync(user);
      if (!userAdded) {
        return new ServiceResponse(ResponseStatus.Failed, 'User not found', null, StatusCodes.NOT_FOUND);
      }
      return new ServiceResponse<User[]>(ResponseStatus.Success, 'User found', userAdded, StatusCodes.OK);
    } catch (ex) {
      const errorMessage = `Cannot add user:, ${(ex as Error).message}`;
      logger.error(errorMessage);
      return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  },

  // Adds a single user
  deleteUser: async (id: number): Promise<ServiceResponse<object | null>> => {
    try {
      const userDeleted: boolean = await userRepository.deleteUserAsync(id);
      if (!userDeleted) {
        return new ServiceResponse(ResponseStatus.Failed, 'User not found', null, StatusCodes.NOT_FOUND);
      }
      return new ServiceResponse<object>(ResponseStatus.Success, 'User deleted', { userDeleted }, StatusCodes.OK);
    } catch (ex) {
      const errorMessage = `Cannot delete user:, ${(ex as Error).message}`;
      logger.error(errorMessage);
      return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  },

  deleteAllUser: async (): Promise<ServiceResponse<object | null>> => {
    try {
      const userDeleted: boolean = await userRepository.deleteAllUserAsync();
      if (!userDeleted) {
        return new ServiceResponse(ResponseStatus.Failed, 'Users not found', null, StatusCodes.NOT_FOUND);
      }
      return new ServiceResponse<object>(ResponseStatus.Success, 'Users deleted', { userDeleted }, StatusCodes.OK);
    } catch (ex) {
      const errorMessage = `Cannot delete user:, ${(ex as Error).message}`;
      logger.error(errorMessage);
      return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  },
};
