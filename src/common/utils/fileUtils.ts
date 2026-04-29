import fs from 'fs/promises';

import { env } from '@/common/utils/envConfig';
import { logger } from '@/server';

const ENABLE_FILE_LOGGING = env.ENABLE_FILE_LOGGING;
export const writeDataInFile = async (fileName: string, data: string) => {
 try {
  if (ENABLE_FILE_LOGGING) {
   await fs.appendFile(fileName, `${JSON.stringify(data)} \n`, 'utf8');
  }
 } catch (error) {
  logger.error(error);
 }
};

export const readFileData = async (fileName: string): Promise<string> => {
 try {
  const data = await fs.readFile(fileName, 'utf8');
  return data;
 } catch (error) {
  logger.error(error);
  throw error;
 }
};
