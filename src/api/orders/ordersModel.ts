import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export type Order = z.infer<typeof OrdersSchema>;

export const OrdersSchema = z.object({
 items: z.array(
  z.object({
   itemId: z.string(),
   quantity: z.number(),
   priceperItem: z.number(),
   totalPrice: z.number(),
   taxPrice: z.number(),
   totalPriceWithTax: z.number(),
   discountCoupon: z.string().optional(),
   discountPrice: z.number().optional(),
  })
 ),
 orderStatus: z.enum(['Pending', 'Shipped', 'Delivered', 'Cancelled']),
 paymentStatus: z.enum(['Pending', 'Paid', 'Failed']),
 paymentMethod: z.enum(['CreditCard', 'DebitCard', 'PayPal']),
 deliveryDate: z.date().optional(),
 deliveryStatus: z.enum(['Pending', 'InTransit', 'Delivered']),
 deliveryAddress: z.string().optional(),
 deliveryInstructions: z.string().optional(),
 trackingNumber: z.string().optional(),
 trackingUrl: z.string().optional(),
 orderDate: z.date(),
 orderTime: z.string(),
 orderNumber: z.string(),
 orderId: z.string(),
 orderType: z.enum(['Standard', 'Express']),
 orderSource: z.enum(['Website', 'MobileApp']),
 orderChannel: z.enum(['Online', 'InStore']),
 userId: z.string(),
 address: z.string().optional(),
 totalPrice: z.number(),
 createdAt: z.date(),
 updatedAt: z.date(),
});

export const AddOrdersSchema = z.object({
 body: z.object({
  items: z.array(
   z.object({
    itemId: z.number(),
    quantity: z.number(),
    discountCoupon: z.string().optional(),
   })
  ),
  paymentStatus: z.enum(['Pending', 'Paid', 'Failed']),
  paymentMethod: z.enum(['CreditCard', 'DebitCard', 'PayPal']),
  orderType: z.enum(['Standard', 'Express']),
  orderSource: z.enum(['Website', 'MobileApp']),
  orderChannel: z.enum(['Online', 'InStore']),
  userId: z.string(),
  address: z.string().optional(),
 }),
});

// Input Validation for 'GET Orders/:id' endpoint
export const GetOrdersSchema = z.object({
 params: z.object({ id: z.string() }),
});

// Input Validation for 'GET Orders/:id' endpoint
export const DeleteOrdersSchema = z.object({
 params: z.object({ id: z.string() }),
});
