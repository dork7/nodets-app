import { redisClient } from '@/config/redisStore';

export const redis = {
  setValue: async (key: string, value: any): Promise<string | null> => {
    return redisClient.set(key, JSON.stringify(value));
  },
  getValue: async (key: string): Promise<{} | null> => {
    return redisClient.get(key);
  },
};
