import zodSchema from '@zodyac/zod-mongoose';
import mongoose from 'mongoose';

import { FileReference, FileReferenceSchema } from '@/api/minio/minioModel';
import { logger } from '@/server';

const FileModel = mongoose.model('FileReference', zodSchema(FileReferenceSchema));

export const minioRepository = {
  findAllAsync: async (): Promise<FileReference[]> => {
    return FileModel.find().sort({ createdAt: -1 }).exec();
  },

  addAsync: async (file: FileReference): Promise<FileReference | null> => {
    try {
      file.createdAt = new Date();
      const added: FileReference | null = await FileModel.create(file);
      return added ?? null;
    } catch (ex) {
      const errorMessage = `Cannot add file reference: ${(ex as Error).message}`;
      logger.error(errorMessage);
      return null;
    }
  },

  findByIdAsync: async (id: string): Promise<FileReference | null> => {
    return FileModel.findOne({ id }).exec();
  },

  deleteByIdAsync: async (id: string): Promise<boolean> => {
    const result = await FileModel.deleteOne({ id }).exec();
    return result.deletedCount > 0;
  },
};
