import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function getLLMModels() {
 try {
  const { stdout } = await execAsync('docker model list --openai');

  const parsedData = JSON.parse(stdout);
  const llmImages = parsedData.data.map((model: any) => model.id);

  console.log('🧠 LLM-related Docker images found:');
  console.log(llmImages.length ? llmImages : 'No LLM models found.');
  return llmImages.join(',');
 } catch (err) {
  console.error('❌ Error fetching LLM models:', err);
 }
}
