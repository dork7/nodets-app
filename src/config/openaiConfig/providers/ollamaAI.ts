import OpenAI from 'openai';

import { env } from '@/common/utils/envConfig';

export const name = 'ollama';

// OLLAMA_URL is a bare host, so the OpenAI-compatible chat/completions client
// needs /v1 appended here (mirrors localAI.ts's handling of LOCALAI_URL).
const chatBaseURL = env.OLLAMA_URL.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';

export const ollamaAIInstance = new OpenAI({
 baseURL: chatBaseURL,
 apiKey: env.OPENAI_API_KEY || '',
});

export const handler = ollamaAIInstance;
