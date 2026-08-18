import express from 'express';
import path from 'path';

import { aiProvidersRouter } from '@/api/aiProviders/aiProvidersRouter';
import { aiUtilsRouter } from '@/api/aiUtils/aiUtilsRouter';
import { catalogueRouter } from '@/api/catalogue/catalogueRouter';
import { healthCheckRouter } from '@/api/healthCheck/healthCheckRouter';
import { kafkaRouter } from '@/api/kafka/kafkaRouter';
import { minioRouter } from '@/api/minio/minioRouter';
import { ragRouter } from '@/api/rag/ragRouter';
import { redisRouter } from '@/api/redis/redisRouter';
import { nutritionRouter } from '@/api/vision/nutritionRouter';
import { visionRouter } from '@/api/vision/visionRouter';
import { readFileData } from '@/common/utils/fileUtils';

const router = express.Router();

router.use('/v1/health-check', healthCheckRouter);
router.use('/aiUtils', aiUtilsRouter);
router.use('/redis', redisRouter);
router.use('/kafka', kafkaRouter);
router.use('/catalogue', catalogueRouter);
router.use('/vision', visionRouter);
router.use('/nutrition', nutritionRouter);
router.use('/minio', minioRouter);
router.use('/rag', ragRouter);
router.use('/aiProviders', aiProvidersRouter);

router.use('/dashboard', async (req, res) => {
 const fileContent = await readFileData('file.txt');
 res.render(path.join(__dirname, 'public'), {
  appUsers: [{ user_name: 'test' }, { user_name: 'test2' }],
  fileContent: '123',
 });
});

export default router;
