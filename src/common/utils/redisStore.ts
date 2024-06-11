import { IRedis } from '@/api/redis/redisModel';
import { redisClient } from '@/config/redisStore';

export const redis = {
 setValue: async (key: string, value: any): Promise<string | null> => {
  return redisClient.set(key, JSON.stringify(value));
 },
 getValue: async (key: string): Promise<IRedis | null> => {
  return JSON.parse((await redisClient.get(key)) as string);
 },
 deleteValue: async (key: string): Promise<number> => {
  return redisClient.del(key);
 },
 updateValue: async (key: string, value: any): Promise<string | null> => {
  const data: IRedis | null = JSON.parse((await redisClient.get(key)) as string);
  return redisClient.set(key, JSON.stringify({ ...data, ...value }));
 },
};
