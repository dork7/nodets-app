import { OpenAI } from 'openai';

import { env } from '@/common/utils/envConfig';

import { getModel } from './registry';
import { OpenAITool } from './tools';

const DEFAULT_PROVIDER = 'localAI';
const EMBEDDING_MODEL = env.LOCALAI_EMBEDDING_MODEL;

export type { OpenAITool };

export const getOpenAIInstance = (provider: string = DEFAULT_PROVIDER): OpenAI => {
 const client = getModel(provider) as OpenAI | undefined;
 if (!client) {
  throw new Error(`No OpenAI-compatible model instance registered for provider: ${provider}`);
 }
 return client;
};

// Lazily resolve the default client so it stays valid after loadAIProviders() runs.
export const openai: OpenAI = new Proxy({} as OpenAI, {
 get: (_target, prop) => {
  const client = getOpenAIInstance(DEFAULT_PROVIDER);
  const value = Reflect.get(client, prop, client);
  return typeof value === 'function' ? value.bind(client) : value;
 },
});

export async function callAI(
 model: string,
 messages: any[],
 options?: {
  stream?: boolean;
  tools?: OpenAITool[];
  temperature?: number;
  max_tokens?: number;
  provider?: string;
 },
 signal?: AbortSignal
) {
 const { provider, ...requestOptions } = options ?? {};
 const client = getOpenAIInstance(provider);

 const completion = await client.chat.completions.create(
  {
   model, // or any model listed on OpenRouter
   messages,
   // Ask the server to include usage in the final streaming chunk so token
   // counts are available to the WebSocket client.
   ...(requestOptions.stream ? { stream_options: { include_usage: true } } : {}),
   ...(requestOptions ? requestOptions : {}),
   tools: []
  },
  { signal }
 );
 return completion;
}

export async function createEmbeddings(
 input: string | string[],
 options?: { model?: string; provider?: string }
): Promise<number[][]> {
 const { model = EMBEDDING_MODEL, provider } = options ?? {};
 const client = getOpenAIInstance(provider);

 const response = await client.embeddings.create({
  model,
  input,
 });

 return response.data.map((item) => item.embedding);
}
