import { env } from '@/common/utils/envConfig';
import customAxios from '@/config/axios';
import { logger } from '@/server';

import { Catalogue } from './catalogueModel';

export const catalogue: Catalogue[] = [
 {
  id: 12,
  category: 'old product',
  name: 'fake product',
  stock: 9999999,
  price: 300000,
  description: 'Descp',
  createdAt: new Date(),
  updatedAt: new Date(),
 },
 {
  id: 55,
  category: 'new product',
  name: 'second product',
  stock: 12,
  price: 55,
  description: 'Descp',
  createdAt: new Date(),
  updatedAt: new Date(),
 },
];

export const catalogueRepository = {
 findAllAsync: async (): Promise<Catalogue[]> => {
  return catalogue;
 },

 findByIdAsync: async (id: number): Promise<Catalogue | null> => {
  return catalogue.find((user) => user.id === id) || null;
 },

 addAsync: async (user: Catalogue): Promise<Catalogue[] | null> => {
  user.createdAt = new Date();
  user.updatedAt = new Date();
  catalogue.unshift(user);
  return catalogue;
 },

 deleteAsync: async (id: number): Promise<boolean> => {
  const idx: number = catalogue.findIndex((item: Catalogue) => item.id === id);
  if (idx < 0) {
   return false;
  }
  if (idx > -1) {
   catalogue.splice(idx, 1);
  }
  return true;
 },

 deleteAllAsync: async (): Promise<boolean> => {
  if (catalogue.length < 1) {
   return false;
  }
  catalogue.length = 0;
  return true;
 },

 // get profucts from mock API
 fetchProducts: async (): Promise<any> => {
  const products = await customAxios.get(env.PRODUCTS_API);
  return products.data;
 },

 fetchProductsById: async (id: number): Promise<any> => {
  const url = `${env.PRODUCTS_API}/${id}`;
  const products = await customAxios.get(url);
  logger.info(products.status);
  return products;
 },
};
