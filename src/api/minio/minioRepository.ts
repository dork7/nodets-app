import { FileReference, FileReferenceSchema } from '@/api/minio/minioModel';
import { redisClient } from '@/config/redisStore';
import { logger } from '@/server';

const FILE_REFERENCE_PREFIX = 'fileReference:';
const FILE_REFERENCE_INDEX = 'fileReferences:index';

const parseReference = (value: string | null): FileReference | null => {
 if (!value) {
  return null;
 }
 const raw = JSON.parse(value);
 const parsed = FileReferenceSchema.safeParse({ ...raw, createdAt: new Date(raw.createdAt) });
 return parsed.success ? parsed.data : null;
};

export const minioRepository = {
 findAllAsync: async (): Promise<FileReference[]> => {
  try {
   const ids = await redisClient.zRange(FILE_REFERENCE_INDEX, 0, -1, { REV: true });
   if (ids.length === 0) {
    return [];
   }
   const values = await Promise.all(ids.map((id) => redisClient.get(`${FILE_REFERENCE_PREFIX}${id}`)));
   return values.map(parseReference).filter((file): file is FileReference => file !== null);
  } catch (ex) {
   const errorMessage = `Cannot list file references: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return [];
  }
 },

 addAsync: async (file: FileReference): Promise<FileReference | null> => {
  try {
   const record: FileReference = { ...file, createdAt: new Date() };
   await redisClient.set(`${FILE_REFERENCE_PREFIX}${record.id}`, JSON.stringify(record));
   await redisClient.zAdd(FILE_REFERENCE_INDEX, { score: record.createdAt.getTime(), value: record.id });
   return record;
  } catch (ex) {
   const errorMessage = `Cannot add file reference: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return null;
  }
 },

 findByIdAsync: async (id: string): Promise<FileReference | null> => {
  return parseReference(await redisClient.get(`${FILE_REFERENCE_PREFIX}${id}`));
 },

 deleteByIdAsync: async (id: string): Promise<boolean> => {
  const deleted = await redisClient.del(`${FILE_REFERENCE_PREFIX}${id}`);
  if (deleted > 0) {
   await redisClient.zRem(FILE_REFERENCE_INDEX, id);
  }
  return deleted > 0;
 },

 deleteAllAsync: async (): Promise<number> => {
  try {
   const ids = await redisClient.zRange(FILE_REFERENCE_INDEX, 0, -1, { REV: true });
   if (ids.length === 0) {
    return 0;
   }
   await redisClient.del(ids.map((id) => `${FILE_REFERENCE_PREFIX}${id}`));
   await redisClient.del(FILE_REFERENCE_INDEX);
   return ids.length;
  } catch (ex) {
   const errorMessage = `Cannot delete file references: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return 0;
  }
 },
};
