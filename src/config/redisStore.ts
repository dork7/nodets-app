import { createClient } from 'redis';

import { logger } from '@/server';

import { env } from '../common/utils/envConfig';

const CONF: any = {
 db: 5,
 host: env.REDIS_HOST,
 port: env.REDIS_PORT,
};

export const redisClient = createClient(CONF);

redisClient.on('error', (err) => {
 logger.error(err, 'Redis error');
});

redisClient.on('connect', () => {
 logger.info({}, 'Redis connected');
});
