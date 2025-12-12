import OpenAI from 'openai';

import { env } from '@/common/utils/envConfig';
import { logger } from '@/server';

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
const openai = new OpenAI({
 baseURL: 'http://localhost:12434/engines/llama.cpp/v1',
 apiKey: env.OPENAI_API_KEY || '',
});

export async function callAI(params: [], streamMode = true, aiModel: string) {
 const completion = await openai.chat.completions.create({
  model: aiModel, // or any model listed on OpenRouter
  messages: params,
  stream: streamMode, // Enable streaming
 });
 return completion;
}

export async function isRelatedConversation(previousMessage: string, currentMessage: string, aiModel: string) {
 const checkPrompt = `
Conversation so far: "${previousMessage}"
User's new message: "${currentMessage}"

Does the new message continue the same topic, or start a new one?
Respond with only "related" or "unrelated".
`;

 const completion = await openai.chat.completions.create({
  model: aiModel, // or any model listed on OpenRouter
  messages: [{ role: 'user', content: checkPrompt }],
 });
 return completion.choices[0].message.content === 'related';
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
}
