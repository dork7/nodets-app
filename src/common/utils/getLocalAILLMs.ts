export const LOCALAI_URL = process.env.LOCALAI_URL || 'http://localhost:8080';

export async function getLocalAILLMs() {
 try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
   const response = await fetch(`${LOCALAI_URL}/v1/models`, {
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
   });

   if (!response.ok) {
    throw new Error(`LocalAI returned status ${response.status}`);
   }

   const parsedData = await response.json();
   const llmModels = parsedData.data.map((model: any) => model.id);

   console.log('🧠 LocalAI models found:');
   console.log(llmModels.length ? llmModels : 'No LLM models found.');
   return llmModels.join(',');
  } finally {
   clearTimeout(timeout);
  }
 } catch (err) {
  console.error('❌ Error fetching LocalAI models:', err);
 }
}
