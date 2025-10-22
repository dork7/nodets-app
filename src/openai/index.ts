import OpenAI from 'openai';

import { env } from '@/common/utils/envConfig';
import { logger } from '@/server';

const openai = new OpenAI({
 baseURL: 'https://openrouter.ai/api/v1',
 apiKey: env.OPENAI_API_KEY || '',
});

export async function callAI(params: string) {
 const completion = await openai.chat.completions.create({
  model: 'deepseek/deepseek-chat-v3.1', // or any model listed on OpenRouter
  messages: [{ role: 'user', content: params }],
  stream: true, // Enable streaming
 });
 return completion;
}
