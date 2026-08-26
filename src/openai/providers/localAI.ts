import OpenAI from 'openai';

import { env } from '@/common/utils/envConfig';

export const name = 'localAI';

export const localAIInstance = new OpenAI({
 baseURL: env.LOCALAI_URL,
 apiKey: env.OPENAI_API_KEY || '',
});

export const handler = localAIInstance;
