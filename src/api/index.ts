import express from 'express';
import path from 'path';

import { catalogueRouter } from '@/api/catalogue/catalogueRouter';
import { healthCheckRouter } from '@/api/healthCheck/healthCheckRouter';
import { kafkaRouter } from '@/api/kafka/kafkaRouter';
import { redisRouter } from '@/api/redis/redisRouter';
import { userRouter } from '@/api/user/userRouter';
import { readFileData } from '@/common/utils/fileUtils';
import { visionRouter } from '@/api/vision/visionRouter';

import { ordersRouter } from './orders/ordersRouter';

const router = express.Router();

router.use('/v1/health-check', healthCheckRouter);
router.use('/users', userRouter);
router.use('/redis', redisRouter);
router.use('/kafka', kafkaRouter);
router.use('/catalogue', catalogueRouter);
router.use('/orders', ordersRouter);
router.use('/vision', visionRouter);

router.use('/dashboard', async (req, res) => {
 const fileContent = await readFileData('file.txt');
 res.render(path.join(__dirname, 'public'), {
  appUsers: [{ user_name: 'test' }, { user_name: 'test2' }],
  fileContent: '123',
 });
});

export default router;
