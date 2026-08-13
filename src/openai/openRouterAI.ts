import OpenAI from 'openai';

import { env } from '@/common/utils/envConfig';

export const openRouterAIInstance = new OpenAI({
 baseURL: env.OPENROUTER_BASE_URL,
 apiKey: env.OPENROUTER_API_KEY,
});
