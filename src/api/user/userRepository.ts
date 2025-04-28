import zodSchema from '@zodyac/zod-mongoose';
import mongoose from 'mongoose';

import { User, UserSchema } from '@/api/user/userModel';
import { logger } from '@/server';

export const users: User[] = [
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

const userSchemaa = zodSchema(UserSchema);

const UserModel = mongoose.model('User', userSchemaa);

export default User;

export const userRepository = {
 findAllAsync: async (): Promise<User[]> => {
  return UserModel.find().exec();
 },

 findByIdAsync: async (id: string): Promise<User | null> => {
  return UserModel.findById(id) || null;
 },

 addUserAsync: async (user: User): Promise<User | null> => {
  try {
   user.updatedAt = new Date();
   user.createdAt = new Date();
   const userAdded: User | null = await UserModel.create(user);
   if (!userAdded) {
    return null;
   }
   return userAdded;
  } catch (ex) {
   const errorMessage = `Cannot add user:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   return ex;
  }
 },

 deleteUserAsync: async (id: number): Promise<boolean> => {
  const idx: number = users.findIndex((item: User) => item.id === id);
  if (idx < 0) {
   return false;
  }
  if (idx > -1) {
   users.splice(idx, 1);
  }
  return true;
 },

 deleteAllUserAsync: async (): Promise<boolean> => {
  if (users.length < 1) {
   return false;
  }
  users.length = 0;
  return true;
 },
};
