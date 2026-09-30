import { env } from 'process';

import { callAI, openai } from '@/config/openaiConfig';
import { buildRelationCheckPrompt } from '@/config/prompt';

export async function isRelatedConversation(
 previousMessage: string,
 currentMessage: string,
 model: string // actually use it
): Promise<boolean> {
 const prompt = buildRelationCheckPrompt(previousMessage, currentMessage);

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
  console.error('isRelatedConversation failed:', err);
  return true; // fail open: keep context when unsure
 }
}
