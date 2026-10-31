import { env } from 'process';

import { callAI } from '@/config/openaiConfig';
import { buildRagRelevancePrompt } from '@/config/prompt';

// Checks whether the context retrieved from the vector store actually relates
// to the user's query, so the caller can fall back to "no context" instead of
// injecting irrelevant chunks (e.g. a near-miss vector match) into the prompt.
export async function isRagAnswerRelated(query: string, retrievedContext: string): Promise<boolean> {
 const prompt = buildRagRelevancePrompt(query, retrievedContext);

 try {
  const model = env.LOCALAI_RELEVANCE_MODEL as string;
  const completion: any = await callAI(
   model,
   [{ role: 'user', content: prompt }],
   { stream: false, temperature: 0, max_tokens: 2 }
  );

  const answer = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
  return answer.startsWith('yes');
 } catch (err) {
  console.error('isRagAnswerRelated failed:', err);
  return true; // fail open: keep the retrieved context when unsure
 }
}
