import { NextFunction, Request, Response } from 'express';

import { logger } from '@/server';

import { redis } from '../utils/redisStore';

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

export const cacheHandler = async (req: Request, res: Response, next: NextFunction) => {
 // * @description x-cached means hitting th cache middleware
 res.setHeader('x-cached', 'HIT');
 const key = JSON.stringify(req.params);
 const storedData = await redis.getValue(key);
 if (!storedData) {
  res.setHeader('x-cached-get', 'MISS');
  // redis.setValue(key, res)
  next();
  logger.info('redis data ', res);
 }
 // * @description set cache-control max-age=1 to invalidate cache
 // * @description set cache-control no-cache to to skip the cache
 // * @description set x-cached-get MISS/HIT if response is from cache or not.

 res.setHeader('x-cached-get', 'HIT');
 //  res.setHeader('test', req.headers['cache-control'] as string);
 //  next();
};
