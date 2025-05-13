import zodSchema from '@zodyac/zod-mongoose';
import mongoose, { mongo } from 'mongoose';

import { Order, OrdersSchema } from '@/api/orders/ordersModel';
import { logger } from '@/server';

export const orders: Order[] = [
 { id: 1, name: 'Alice', email: 'alice@example.com', age: 42, createdAt: new Date(), updatedAt: new Date() },
 {
  id: 2,
  name: 'Bob',
  email: 'bob@example.com',
  age: 21,
  createdAt: new Date(),
  hobbies: ['Trecking'],
  updatedAt: new Date(),
 },
];

const orderSchemaa = zodSchema(OrdersSchema);

const orderModel = mongoose.model('order', orderSchemaa);

export default Order;

export const orderRepository = {
 findAllAsync: async (): Promise<Order[]> => {
  return orderModel.find().exec();
 },

 findByIdAsync: async (id: string): Promise<Order | null> => {
  return orderModel.findById(id) || null;
 },

 addorderAsync: async (order: Order): Promise<Order | null> => {
  try {
   order.updatedAt = new Date();
   order.createdAt = new Date();
   order.orderDate = new Date();
   order.orderTime = new Date().toLocaleTimeString();

   const orderAdded: Order | null = await orderModel.create(order);
   if (!orderAdded) {
    return null;
   }
   return orderAdded;
  } catch (ex) {
   const errorMessage = `Cannot add order:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return ex;
  }
 },

 deleteorderAsync: async (id: string): Promise<any> => {
  return orderModel.findOneAndDelete(id as unknown as mongoose.FilterQuery<order>);
 },

 deleteAllorderAsync: async (): Promise<any> => {
  return orderModel.deleteMany();
 },
};
