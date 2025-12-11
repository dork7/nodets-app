import zodSchema from '@zodyac/zod-mongoose';
import mongoose, { mongo } from 'mongoose';

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

 updateAsync: async (user: User): Promise<User | null> => {
  try {
   user.updatedAt = new Date();
   const userAdded: User | null = await UserModel.findOneAndUpdate({ _id: user._id }, user);
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

 updateOrderCount: async (user: User): Promise<User | null> => {
  try {
   user.updatedAt = new Date();
   const userUpdated: User | null = await UserModel.findByIdAndUpdate(
    { _id: user.userId },
    {
     $inc: {
      orderCount: 1,
     },
     $set: {
      name: 'testtt',
     },
     $push: {
      orderHistory: { orderId: user.orderId, orderRef: user.orderRef }, // 3. Push into array
     },
    },
    { new: true } // Return the updated document
   );
   if (!userUpdated) {
    return null;
   }
   return userUpdated;
  } catch (ex) {
   const errorMessage = `Cannot update user:, ${(ex as Error).message}`;
   logger.error(errorMessage);
   throw ex;
  }
 },

 deleteUserAsync: async (id: string): Promise<any> => {
  return UserModel.findOneAndDelete(id as unknown as mongoose.FilterQuery<User>);
 },

 deleteAllUserAsync: async (): Promise<any> => {
  return UserModel.deleteMany();
 },
};
