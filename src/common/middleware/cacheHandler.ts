import { NextFunction, Response } from 'express';

import { redis } from '../../services/redisStore';
import { RequestProps } from '../interfaces/common';

const revalidateCache = (key: string) => {
 redis.deleteValue(key);
};

/**
 *
 * @param req Request
 * @param res Response
 * @param next Next
 * @description handler to get/set the cache
 * @description x-cached means hitting th cache middleware
 * @description set cache-control max-age=1 to invalidate cache
 * @description set cache-control no-cache to to skip the cache
 * @description set x-cached-get MISS/HIT if response is from cache or not.
 */

export const cacheHandler = async (req: RequestProps, res: Response, next: NextFunction) => {
 if (req.hashKey) {
  const key = req.hashKey as string;

  res.setHeader('x-cached', 'HIT');
  if (!redis.isRedisWorking()) {
   res.setHeader('x-cached', 'MISS');
   res.setHeader('x-cached-get', 'MISS');
   next();
  }

  if (req.headers['cache-control'] === 'max-age=0') {
   revalidateCache(key);
  }

  const storedData = await redis.getValue(key);
  if (!storedData) {
   res.setHeader('x-cached-get', 'MISS');
   // redis.setValue(key, res)
   const originalSend = res.send;
   res.send = function (body: any): Response<any, Record<string, any>> {
    redis.setValue(key, body, req.cacheTTL);
    res.setHeader('x-cached-get', 'MISS');
    return originalSend.call(this, body);
   };
   next();
  } else {
   res.setHeader('x-cached-get', 'HIT');
   return res.send(storedData);
  }
 } else {
  next();
 }
};
