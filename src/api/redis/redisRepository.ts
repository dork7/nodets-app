import { redis } from '@/common/utils/redisStore';

export const redisRepository = {
 storeData: async (key: string, dataSet: any): Promise<string | null> => {
  return redis.setValue(key, dataSet);
 },
 getDataByID: async (key: string): Promise<{} | null> => {
  return redis.getValue(key);
 },
};
