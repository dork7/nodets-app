import { NextFunction, Response } from 'express';
import hashObject from 'object-hash';

import { CacheConfig } from '@/common/interfaces/caching';
import { RequestProps } from '@/common/interfaces/common';
import { logger } from '@/server';

export const cacheConfig = {
 createHash: (cacheConfig: CacheConfig[]) => {
  logger.info('Creating cache hash');
  return cacheConfig.map((item: CacheConfig) => hashObject({ url: item.url, query: item.query }));
 },
 decodeHash: (hash: string): CacheConfig => {
  return hashObject.keys(hash) as unknown as CacheConfig;
 },
 checkConfig: (req: RequestProps, cacheConfigHash: string[]) => {
  const queryKeys = Object.keys(req.query) ?? [];
  const url = req.url.split('?')[0];
  const hash = hashObject({
   url: url,
   query: queryKeys,
  });
  return cacheConfigHash.find((item: string) => item === hash);
 },
 generateHashKey: (req: RequestProps) => {
  const reqToHash = {
   url: req.url,
   query: req.query,
   body: req.body,
  };
  return hashObject(reqToHash, {});
 },
};

export const cacheConfigHandler = async (req: RequestProps, res: Response, next: NextFunction) => {
 const hasCacheRule: string | undefined = cacheConfig.checkConfig(req, global.cacheHash);
 if (!hasCacheRule) {
  next();
 } else {
  const rule = cacheConfig.decodeHash(hasCacheRule);
  const { ttl } = rule;
  req.hashKey = cacheConfig.generateHashKey(req);
  req.cacheTTL = ttl;
  next();
 }
};
