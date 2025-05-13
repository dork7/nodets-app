import fs from 'fs/promises';

import { env } from '@/common/utils/envConfig';

const ENABLE_FILE_LOGGING = env.ENABLE_FILE_LOGGING;
export const writeDataInFile = async (data: string, fileName: string) => {
 try {
  if (ENABLE_FILE_LOGGING) {
   await fs.appendFile(fileName, `${data} \n`, 'utf8');
  }
 } catch (error) {
  console.log(error);
 }
};

export const readFileData = async (fileName: string): Promise<string> => {
 try {
  const data = await fs.readFile(fileName, 'utf8');
  return data;
 } catch (error) {
  console.log(error);
  throw error;
 }
};
