import OpenAI from 'openai';

import { env } from '@/common/utils/envConfig';

export const visionOpenAI = new OpenAI({
 baseURL: env.VISION_BASE_URL,
 apiKey: env.VISION_API_KEY || env.OPENAI_API_KEY,
});
