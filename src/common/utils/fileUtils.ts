import fs from 'fs/promises';
export const writeDataInFile = async (data: string, fileName: string) => {
 try {
  await fs.appendFile(fileName, `${data} \n`, 'utf8');
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
