import express from 'express';

import { catalogueRouter } from '@/api/catalogue/catalogueRouter';
import { healthCheckRouter } from '@/api/healthCheck/healthCheckRouter';
import { kafkaRouter } from '@/api/kafka/kafkaRouter';
import { redisRouter } from '@/api/redis/redisRouter';
import { userRouter } from '@/api/user/userRouter';

const router = express.Router();


router.use('/v1/health-check', healthCheckRouter);
router.use('/users', userRouter);
router.use('/redis', redisRouter);
router.use('/kafka', kafkaRouter);
router.use('/catalogue', catalogueRouter);

export default router;
