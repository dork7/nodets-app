import fs from 'fs/promises';
export const writeDataInFile = async (data: string, fileName: string) => {
 try {
  await fs.appendFile(fileName, `${data} \n`, 'utf8');
 } catch (error) {
  console.log(error);
 }
};
