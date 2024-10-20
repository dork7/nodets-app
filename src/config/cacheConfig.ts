import { NextFunction, Response } from 'express';
import hashObject from 'object-hash';

import { CacheConfig } from '@/common/interfaces/caching';
import { RequestProps } from '@/common/interfaces/common';

export const cacheConfig: CacheConfig[] = [
 { url: '/v1/catalogue', body: [], query: ['id'], ttl: 3600 },
 { url: '/v1/test', body: [], query: ['id'], ttl: 1 },
];

const checkQueryRule = (cacheConfig: CacheConfig[], queryRule: string[]) => {
 return cacheConfig.filter((item) => item.query.includes(queryRule.map((item) => item)[0])).length > 0;
};

const checkURL = (cacheConfig: CacheConfig[], url: string) => {
 return cacheConfig.filter((item) => item.url == url).length > 0;
};

const getRule = (cacheConfig: CacheConfig[], url: string) => {
 return cacheConfig.filter((item) => item.url == url)[0];
};

export const cacheConfigHandler = async (req: RequestProps, res: Response, next: NextFunction) => {
 const queryKeys = Object.keys(req.query) ?? [];
 const url = req.url.split('?')[0];

 const hasUrlRule = checkURL(cacheConfig, url);

 if (!hasUrlRule) {
  next();
 } else {
  const ttl: number = getRule(cacheConfig, url).ttl;
  const queryRules: string[] = getRule(cacheConfig, url).query ?? [];
  if (queryRules.length > 0 && checkQueryRule(cacheConfig, queryKeys)) {
   const reqToHash = {
    query: req.query,
    body: req.body,
   };
   const objectHash = hashObject(reqToHash, {});
   // create hash of the requst params
   req.hashKey = objectHash;
   req.cacheTTL = ttl;
   next();
  } else if (queryRules.length === 0) {
   const reqToHash = {
    query: req.query,
    body: req.body,
   };
   const objectHash = hashObject(reqToHash, {});
   // create hash of the requst params
   req.hashKey = objectHash;
   req.cacheTTL = ttl;
   next();
  } else if (hasUrlRule && queryRules.length < 1) {
   const reqToHash = {
    query: req.query,
    body: req.body,
   };
   const objectHash = hashObject(reqToHash, {});
   // create hash of the requst params
   req.hashKey = objectHash;
   req.cacheTTL = ttl;
   next();
  } else {
   next();
  }
 }
};
