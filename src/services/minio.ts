import { Client } from 'minio';

export const minioClient = new Client({
 endPoint: process.env.MINIO_ENDPOINT,
 port: parseInt(process.env.MINIO_PORT as string),
 useSSL: process.env.MINIO_USE_SSL === 'true',
 accessKey: process.env.MINIO_ACCESS_KEY,
 secretKey: process.env.MINIO_SECRET_KEY,
});

export const MINIO_BUCKET = process.env.MINIO_BUCKET || 'uploads';

export const publicReadPolicy = (bucket: string): string =>
 JSON.stringify({
  Version: '2012-10-17',
  Statement: [
   {
    Effect: 'Allow',
    Principal: { AWS: ['*'] },
    Action: ['s3:GetObject'],
    Resource: [`arn:aws:s3:::${bucket}/*`],
   },
  ],
 });

export const initMinio = async () => {
 const bucketExists = await minioClient.bucketExists(MINIO_BUCKET);
 if (!bucketExists) {
  await minioClient.makeBucket(MINIO_BUCKET);
 }
 try {
  await minioClient.setBucketPolicy(MINIO_BUCKET, publicReadPolicy(MINIO_BUCKET));
 } catch (ex) {
  console.error(`Failed to set public read policy on bucket ${MINIO_BUCKET}:`, ex);
 }
};
