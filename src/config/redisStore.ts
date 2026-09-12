import { createClient } from 'redis';
import { logger } from '@/server';
import { env } from '../common/utils/envConfig';

const CONF: any = {
  db: 5,
  url: `redis://${env.REDIS_HOST}:${env.REDIS_PORT}`
};

export const redisClient = createClient(CONF);

redisClient.on('error', (err) => {
  logger.error(err, 'Redis error');
});

redisClient.on('connect', () => {
  logger.info({}, 'Redis connected');
});

// Helper to ensure client is connected before use
export const ensureConnected = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};
