import OpenAI from 'openai';

import { env } from '@/common/utils/envConfig';

const openai = new OpenAI({
 baseURL: 'https://openrouter.ai/api/v1',
 apiKey: env.OPENAI_API_KEY || '',
});

export async function callAI(params: string) {

    const completion = await openai.chat.completions.create({
  model: 'openai/gpt-4o', // or any model listed on OpenRouter
  messages: [{ role: 'user', content: params }],
 });

 console.log(completion.choices[0].message);
 return completion.choices[0].message;
}
