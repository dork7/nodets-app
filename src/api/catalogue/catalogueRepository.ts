import { Catalogue } from './catalogueModel';

export const catalogue: Catalogue[] = [
 { id: 1, name: 'Alice', createdAt: new Date(), updatedAt: new Date() },
 { id: 2, name: 'Bob', createdAt: new Date(), updatedAt: new Date() },
];

export const userRepository = {
 findAllAsync: async (): Promise<Catalogue[]> => {
  return catalogue;
 },

 findByIdAsync: async (id: number): Promise<Catalogue | null> => {
  return catalogue.find((user) => user.id === id) || null;
 },

 addUserAsync: async (user: Catalogue): Promise<Catalogue[] | null> => {
  user.createdAt = new Date();
  user.updatedAt = new Date();
  catalogue.unshift(user);
  return catalogue;
 },

 deleteUserAsync: async (id: number): Promise<boolean> => {
  const idx: number = catalogue.findIndex((item: Catalogue) => item.id === id);
  if (idx < 0) {
   return false;
  }
  if (idx > -1) {
   catalogue.splice(idx, 1);
  }
  return true;
 },

 deleteAllUserAsync: async (): Promise<boolean> => {
  if (catalogue.length < 1) {
   return false;
  }
  catalogue.length = 0;
  return true;
 },
};
