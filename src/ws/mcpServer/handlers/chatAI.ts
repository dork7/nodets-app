import { callAI } from '@/openai';

export const name = 'chatAI';
export const handler = async (ws: any, message: any) => {
 const aiInput = message.params?.prompt || 'Hello, AI!';
 const aiResponse = await callAI(aiInput);
 ws.send(JSON.stringify({ sender: 'AI', ...aiResponse }));
};
