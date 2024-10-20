import { NextFunction, Response } from 'express';
import hashObject from 'object-hash';

import { CacheConfig } from '@/common/interfaces/caching';
import { RequestProps } from '@/common/interfaces/common';

export const cacheConfig: CacheConfig[] = [
 { url: '/v1/catalogue', body: [], query: ['id'], ttl: 3600 },
 { url: '/v1/test', body: [], query: ['id'], ttl: 1 },
];

const checkQueryRule = (cacheConfig: CacheConfig[], queryRule: string[]) => {
 return cacheConfig.some((item) => item.query.includes(queryRule[0]));
};

const checkURL = (cacheConfig: CacheConfig[], url: string) => {
 return cacheConfig.some((item) => item.url === url);
};

const getRule = (cacheConfig: CacheConfig[], url: string) => {
 return cacheConfig.find((item) => item.url === url);
};

const generateHashKey = (req: RequestProps) => {
 const reqToHash = {
  query: req.query,
  body: req.body,
 };
 return hashObject(reqToHash, {});
};

export const cacheConfigHandler = async (req: RequestProps, res: Response, next: NextFunction) => {
 const queryKeys = Object.keys(req.query) ?? [];
 const url = req.url.split('?')[0];

 const hasUrlRule = checkURL(cacheConfig, url);

 if (!hasUrlRule) {
  next();
 } else {
  const rule = getRule(cacheConfig, url);
  if (!rule) {
   next();
   return;
  }

  const { ttl, query: queryRules = [] } = rule;
  if (queryRules.length > 0 && checkQueryRule(cacheConfig, queryKeys)) {
   req.hashKey = generateHashKey(req);
   req.cacheTTL = ttl;
   next();
  } else {
   next();
  }
 }
};
