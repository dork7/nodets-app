import axios from 'axios';

import { env } from '@/common/utils/envConfig';
import { sendSlackNotification } from '@/common/utils/slack';
import { logger } from '@/server';
import { sendKafkaMessage } from '@/services/kafkaService';

const taxRate = 0.05; // 5% tax rate
const baseURL = env.BASE_URL;
const apiVersion = env.API_VERSION;

export const getItemsDetails = async (order: any) => {
 // get the product from catelogue service
 const items = await Promise.all(
  order.items.map(async (item: any) => {
   // calling to API here to get benifit of caching
   const product = await axios.get(`${baseURL}/${apiVersion}/catalogue/${item.itemId}`);

   if (!product) {
    throw new Error('Product not found');
   }

   const {
    responseObject: { id, price, discountPercentage },
   } = product.data;

   const totalPrice = parseFloat((item.quantity * price).toFixed(2));
   const taxPrice = parseFloat((totalPrice * taxRate).toFixed(2));
   const totalPriceWithTax = parseFloat((totalPrice + taxPrice).toFixed(2));
   const discountPrice = parseFloat((totalPrice - (discountPercentage / 100) * totalPrice).toFixed(2));
   // Calculate the total price, tax price, and total price with tax
   return {
    ...item,
    itemId: id,
    priceperItem: price,
    totalPrice,
    taxPrice,
    totalPriceWithTax,
    discountPrice,
   };
  })
 );

 // Calculate the total price of all items
 const totalPrice = parseFloat(items.reduce((acc: number, item: any) => acc + item.totalPrice, 0)).toFixed(2);
 const taxPrice = parseFloat(items.reduce((acc: number, item: any) => acc + item.taxPrice, 0)).toFixed(2);
 const totalPriceWithTax = parseFloat(
  items.reduce((acc: number, item: any) => acc + item.totalPriceWithTax, 0)
 ).toFixed(2);

 const orderData = {
  items,
  totalPrice,
  taxPrice,
  totalPriceWithTax,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  deliveryDate: order.deliveryDate,
  deliveryAddress: order.deliveryAddress,
  deliveryInstructions: order.deliveryInstructions,
  trackingNumber: order.trackingNumber,
  trackingUrl: order.trackingUrl,
  orderDate: new Date(),
  orderTime: new Date().toLocaleTimeString(),
  orderNumber: `${order.userId}-${new Date().getTime()}`,
  orderId: `${order.userId}-${new Date().getTime()}`,
  orderType: 'Standard',
  orderSource: 'Website',
  orderChannel: 'Online',
  userId: order.userId,
  deliveryStatus: 'Pending',
  orderStatus: 'Pending',
 };
 return orderData;
};

export const updateUserOrders = (userId: string, orderId: string, orderRef: string) => {
 try {
  sendKafkaMessage({
   config: {
    topic: 'orders',
    key: 'key1',
   },
   data: {
    userId,
    orderId,
    orderRef,
    action: 'UPDATE_ORDER_COUNT',
   },
  });
 } catch (ex) {
  logger.error(`Error sending message to kafka: ${(ex as Error).message}`);
  sendSlackNotification(`Error sending message to kafka: ${(ex as Error).message}`, 'ERROR');
 }
};
