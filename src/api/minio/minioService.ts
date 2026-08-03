import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

import { minioClient, MINIO_BUCKET } from '@/services/minio';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
});

const ensureBucket = async (bucket: string) => {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket);
  }
};

export const minioService = {
  uploadFile: async (file: Express.Multer.File, bucket?: string): Promise<ServiceResponse<{ id: string; url: string; name: string }>> => {
    try {
      const targetBucket = bucket || MINIO_BUCKET;
      await ensureBucket(targetBucket);
      const id = uuidv4();
      const filename = `${id}-${file.originalname}`;

      await minioClient.putObject(targetBucket, filename, file.buffer, file.size, {
        'Content-Type': file.mimetype,
      });

      const fileUrl = `${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}/${targetBucket}/${filename}`;

      return new ServiceResponse<{ id: string; url: string; name: string }>(
        ResponseStatus.Success,
        'File uploaded successfully',
        { id, url: fileUrl, name: filename },
        StatusCodes.OK
      );
    } catch (ex) {
      const errorMessage = `Failed to upload file to Minio: ${(ex as Error).message}`;
      logger.error(errorMessage);
      return new ServiceResponse(
        ResponseStatus.Failed,
        errorMessage,
        null,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  },

  uploadMultipleFiles: async (
    files: Express.Multer.File[],
    bucket?: string
  ): Promise<ServiceResponse<Array<{ id: string; url: string; name: string }>>> => {
    try {
      const targetBucket = bucket || MINIO_BUCKET;
      await ensureBucket(targetBucket);
      const uploadResults = await Promise.all(
        files.map(async (file) => {
          const id = uuidv4();
          const filename = `${id}-${file.originalname}`;

          await minioClient.putObject(targetBucket, filename, file.buffer, file.size, {
            'Content-Type': file.mimetype,
          });

          const fileUrl = `${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}/${targetBucket}/${filename}`;

          return { id, url: fileUrl, name: filename };
        })
      );

      return new ServiceResponse<Array<{ id: string; url: string; name: string }>>(
        ResponseStatus.Success,
        'Files uploaded successfully',
        uploadResults,
        StatusCodes.OK
      );
    } catch (ex) {
      const errorMessage = `Failed to upload files to Minio: ${(ex as Error).message}`;
      logger.error(errorMessage);
      return new ServiceResponse(
        ResponseStatus.Failed,
        errorMessage,
        null,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  },

  async getFile(id: string, bucket?: string): Promise<ReadableStream | null> {
    try {
      const targetBucket = bucket || MINIO_BUCKET;
      const files: any[] = [];
      // Use the ID as prefix to narrow down the search
      for await (const obj of minioClient.listObjects(targetBucket, `${id}-`, true)) {
        files.push(obj);
      }
      const file = files.find(f => f.name === `${id}-${f.name.substring(id.length + 1)}`);
      
      if (!file) {
        return null;
      }

      return await minioClient.getObject(targetBucket, file.name);
    } catch (ex) {
      logger.error(`Failed to get file from Minio: ${(ex as Error).message}`);
      return null;
    }
  },

  deleteFile: async (id: string, bucket?: string): Promise<ServiceResponse<boolean>> => {
    try {
      const targetBucket = bucket || MINIO_BUCKET;
      const files = await minioClient.listObjects(targetBucket, undefined, true);
      const file = files.find(f => f.name.startsWith(`${id}-`));
      
      if (!file) {
        return new ServiceResponse(
          ResponseStatus.Failed,
          'File not found',
          null,
          StatusCodes.NOT_FOUND
        );
      }

      await minioClient.removeObject(targetBucket, file.name);

      return new ServiceResponse<boolean>(
        ResponseStatus.Success,
        'File deleted successfully',
        true,
        StatusCodes.OK
      );
    } catch (ex) {
      const errorMessage = `Failed to delete file from Minio: ${(ex as Error).message}`;
      logger.error(errorMessage);
      return new ServiceResponse(
        ResponseStatus.Failed,
        errorMessage,
        null,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  },
};

export const minioUpload = {
  single: upload.single('file'),
  multiple: upload.array('files', 10),
};
