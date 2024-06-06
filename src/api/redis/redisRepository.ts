import { redis } from '@/common/utils/redisStore';

import { IRedis } from './redisModel';

export const redisRepository = {
 storeData: async (key: string, dataSet: IRedis): Promise<string | null> => {
  return redis.setValue(key, dataSet);
 },
 getDataByID: async (key: string): Promise<IRedis | null> => {
  return redis.getValue(key);
 },
};
