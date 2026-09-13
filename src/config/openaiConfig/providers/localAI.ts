import OpenAI from 'openai';

import { env } from '@/common/utils/envConfig';

export const name = 'localAI';

// LOCALAI_URL is a bare host (other consumers like getLocalAILLMs and
// monitorService append their own paths, e.g. /v1/models, /metrics, /system),
// so the OpenAI-compatible chat/completions client needs /v1 appended here.
const chatBaseURL = env.LOCALAI_URL.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';

export const localAIInstance = new OpenAI({
 baseURL: chatBaseURL,
 apiKey: env.OPENAI_API_KEY || '',
});

export const handler = localAIInstance;
