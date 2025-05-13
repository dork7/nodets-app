import { catalogueService } from '../catalogue/catalogueService';

const taxRate = 0.05; // 5% tax rate

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

   const totalPrice = parseFloat((item.quantity * price).toFixed(2));
   const taxPrice = parseFloat((totalPrice * taxRate).toFixed(2));
   const totalPriceWithTax = parseFloat((totalPrice + taxPrice).toFixed(2));
   const discountPrice = parseFloat((totalPrice - (discountPercentage / 100) * totalPrice).toFixed(2));
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
