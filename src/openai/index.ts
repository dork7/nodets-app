import OpenAI from 'openai';

import { env } from '@/common/utils/envConfig';
import type { OpenAITool } from '@/openai/tools';

/*
const openai = new OpenAI({
 baseURL: 'https://openrouter.ai/api/v1',
 apiKey: env.OPENAI_API_KEY || '',
});

export async function callAI(params: string, streamMode = true) {
 const completion = await openai.chat.completions.create({
  model: 'deepseek/deepseek-chat-v3.1', // or any model listed on OpenRouter
  messages: [{ role: 'user', content: params }],
  stream: streamMode, // Enable streaming
 });
 return completion;
} */
export const openai = new OpenAI({
 baseURL: 'http://localhost:8080/v1',
 apiKey: env.OPENAI_API_KEY || '',
});

export async function callAI(
 params: any[],
 streamMode = true,
 aiModel: string,
 signal?: AbortSignal,
 tools?: OpenAITool[]
) {
 const completion = await openai.chat.completions.create(
  {
   model: aiModel, // or any model listed on OpenRouter
   messages: params,
   stream: streamMode, // Enable streaming
   // Ask the server to include usage in the final streaming chunk so token
   // counts are available to the WebSocket client.
   ...(streamMode ? { stream_options: { include_usage: true } } : {}),
   // Function calling: give the model descriptions of tools it may call.
   ...(tools ? { tools } : {}),
  },
  { signal }
 );
 return completion;
}

// Function to fetch data from the web
export const webSearch = async (query: any) => {
 const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
 const response = await fetch(url);
 const data = await response.json();
 return data.AbstractText || 'No info found';
};

export const customPrompts = async (prompt: string, aiModel: string) => {
 const completion = await openai.chat.completions.create({
  model: aiModel, // or any model listed on OpenRouter
  messages: [{ role: 'user', content: prompt }],
 });
 return completion.choices[0].message.content;
};
