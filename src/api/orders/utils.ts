import { catalogueService } from '../catalogue/catalogueService';

export const getItemsDetails = async (order: any) => {
 // get the product from catelogue service
 const items = await Promise.all(
  order.items.map(async (item: any) => {
   const product: any = await catalogueService.findById(item.itemId);

   if (!product) {
    throw new Error('Product not found');
   }

   const {
    responseObject: { price, discountPercentage },
   } = product;

   const totalPrice = item.quantity * price;
   const taxPrice = totalPrice * 0.1;
   const totalPriceWithTax = totalPrice + taxPrice;
   const discountPrice = totalPrice - (discountPercentage / 100) * totalPrice;
   // Calculate the total price, tax price, and total price with tax
   return {
    ...item,
    itemId: product.responseObject.id,
    priceperItem: price,
    totalPrice,
    taxPrice,
    totalPriceWithTax,
    discountPrice,
   };
  })
 );

 const orderData = {
  items,
  totalPrice: 123123,
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
