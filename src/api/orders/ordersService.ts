import { StatusCodes } from 'http-status-codes';

import { order } from '@/api/orders/ordersModel';
import { orderRepository } from '@/api/orders/ordersRepository';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

import { catalogueService } from '../catalogue/catalogueService';

export const ordersService = {
 // Retrieves all orders from the database
 findAll: async (): Promise<ServiceResponse<order[] | null>> => {
  try {
   const orders = await orderRepository.findAllAsync();
   if (!orders) {
    return new ServiceResponse(ResponseStatus.Failed, 'No orders found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<order[]>(ResponseStatus.Success, 'orders found', orders, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding all orders: $${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Retrieves a single order by their ID
 findById: async (id: string): Promise<ServiceResponse<order | null>> => {
  try {
   const order = await orderRepository.findByIdAsync(id);
   if (!order) {
    return new ServiceResponse(ResponseStatus.Failed, 'order not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<order>(ResponseStatus.Success, 'order found', order, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error finding order with id ${id}:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // Adds a single order
 add: async (order: order): Promise<ServiceResponse<order | null>> => {
  try {
   // get the product from catelogue service
   const product: any = await catalogueService.findById(order.items[0].itemId);
   if (!product) {
    return new ServiceResponse(ResponseStatus.Failed, 'Product not found', null, StatusCodes.NOT_FOUND);
   }
   // get the product from catelogue service
   order.items[0].totalPrice = product.responseObject.price * order.items[0].quantity;
   order.items[0].priceperItem = product.responseObject.price;
   order.items[0].taxPrice = product.responseObject.price * 0.1;
   order.items[0].discountPrice = product.responseObject.price * 0.1;
   order.orderDate = new Date();
   order.orderTime = new Date().toLocaleTimeString();
   order.orderNumber = `${order.userId}-${new Date().getTime()}`;
   order.orderId = `${order.userId}-${new Date().getTime()}`;
   order.orderType = 'Standard';
   order.orderSource = 'Website';
   order.orderChannel = 'Online';
   order.deliveryDate = new Date();
   order.deliveryStatus = 'Pending';
   order.paymentStatus = 'Pending';
   order.paymentMethod = 'CreditCard';
   order.paymentReference = `${order.userId}-${new Date().getTime()}`;
   order.deliveryAddress = order.address;
   order.deliveryInstructions = 'Please deliver to the front door';
   order.trackingNumber = `${order.userId}-${new Date().getTime()}`;
   order.trackingUrl = `https://tracking.com/${order.userId}-${new Date().getTime()}`;
   order.createdAt = new Date();
   order.updatedAt = new Date();
   order.orderStatus = 'Pending';

   const orderAdded: order | null = await orderRepository.addorderAsync(order);
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
