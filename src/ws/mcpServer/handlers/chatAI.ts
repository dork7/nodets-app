import { callAI } from '@/openai';
import { logger } from '@/server';
import { redis } from '@/services/redisStore';

export const name = 'chatAI';
export const handler = async (ws: any, message: any) => {
 const aiInput = message.params?.prompt || 'Hello, AI!';
 const hs = await historyObject(message.id);
 const newHistory = [...hs, { role: 'user', content: aiInput }];
 await saveHistory(message.id, newHistory);

 const aiResponse = await callAI(JSON.stringify(newHistory));

 ws.send(JSON.stringify({ sender: 'AI', type: 'stream_start', id: message.id }));

 for await (const chunk of aiResponse) {
  if (chunk.choices && chunk.choices[0]?.delta?.content) {
   logger.info('AI Response Chunk:', chunk.choices[0].delta.content);
   ws.send(JSON.stringify({ sender: 'AI', type: 'stream_continue', aiResponse: chunk.choices[0].delta }));
  }
 }
 ws.send(JSON.stringify({ sender: 'AI', type: 'stream_end', id: message.id }));
};

const historyObject = async (userId: string) => {
 const history = await redis.getValue(`chat_history_${userId}`);
 return history || [];
};
const saveHistory = async (userId: string, history: any) => {
 await redis.setValue(`chat_history_${userId}`, history);
};
