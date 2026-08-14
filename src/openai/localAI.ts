import OpenAI from 'openai';
import { env } from '@/common/utils/envConfig';

export const name = 'localAI';

export const localAIInstance = new OpenAI({
    baseURL: 'http://localhost:8080/v1',
    apiKey: env.OPENAI_API_KEY || '',
});
   
export const handler = async () => {
 return {
  name,
  handler: localAIInstance,
 };
};