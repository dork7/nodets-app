import { StatusCodes } from 'http-status-codes';

import Order, { orderRepository } from '@/api/orders/ordersRepository';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

import { catalogueService } from '../catalogue/catalogueService';
import { getItemsDetails } from './utils';

export const ordersService = {
 // Retrieves all orders from the database
 findAll: async (): Promise<ServiceResponse<Order[] | null>> => {
  try {
   const orders = await orderRepository.findAllAsync();
   if (!orders) {
    return new ServiceResponse(ResponseStatus.Failed, 'No orders found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<Order[]>(ResponseStatus.Success, 'orders found', orders, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding all orders: $${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Retrieves a single order by their ID
 findById: async (id: string): Promise<ServiceResponse<Order | null>> => {
  try {
   const order = await orderRepository.findByIdAsync(id);
   if (!order) {
    return new ServiceResponse(ResponseStatus.Failed, 'order not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<Order>(ResponseStatus.Success, 'order found', order, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding order with id ${id}:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Adds a single order
 add: async (order: Order): Promise<ServiceResponse<Order | null>> => {
  try {
   const mappedOrder: any = await getItemsDetails(order);
   const orderAdded: Order | null = await orderRepository.addorderAsync(mappedOrder);
   // TODO: handle the mongoose error codes
   if (!orderAdded) {
    // FIXME: fix the error handling
    return new ServiceResponse(ResponseStatus.Failed, 'Cannot add order', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<order>(ResponseStatus.Success, 'order found', orderAdded, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot add order:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Adds a single order
 delete: async (id: string): Promise<ServiceResponse<object | null>> => {
  try {
   const orderDeleted: boolean = await orderRepository.deleteorderAsync(id);
   if (!orderDeleted) {
    return new ServiceResponse(ResponseStatus.Failed, 'order not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<object>(ResponseStatus.Success, 'order deleted', { orderDeleted }, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot delete order:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 deleteAll: async (): Promise<ServiceResponse<object | null>> => {
  try {
   const orderDeleted: boolean = await orderRepository.deleteAllorderAsync();
   if (!orderDeleted) {
    return new ServiceResponse(ResponseStatus.Failed, 'orders not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<object>(ResponseStatus.Success, 'orders deleted', { orderDeleted }, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Cannot delete order:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
