import { callAI, isRelatedConversation } from '@/openai';
import { logger } from '@/server';
import { redis } from '@/services/redisStore';

export const name = 'chatAI';
export const handler = async (ws: any, message: any) => {
 const aiInput = message.params?.prompt || 'Hello, AI!';
 const aiModel = message?.model || global.aiModels[0];

 const streamParam = message?.stream;
 const stream = streamParam === 'false' || streamParam === false ? false : Boolean(streamParam);

 const hs: any = await historyObject(message.id);

 const isRelated = await isRelatedConversation(hs.length > 0 ? hs[hs.length - 1].content : '', aiInput, aiModel);

 const newHistory: any = [{ role: 'user', content: aiInput }];
 if (!isRelated) {
  //   newHistory.push({ role: 'system', content: 'The previous conversation is unrelated. Start a new topic.' });
 } else {
  newHistory.unshift(...hs);
 }

 saveHistory(message.id, newHistory);

 ws.send(JSON.stringify({ sender: 'AI', type: 'stream_start', id: message.id }));
 const aiResponse: any = await callAI(newHistory, stream, aiModel);

 if (stream) {
  let responseText = '';
  for await (const chunk of aiResponse) {
   if (chunk.choices && chunk.choices[0]?.delta?.content) {
    logger.info(`AI Response Chunk: , ${chunk.choices[0].delta.content}`);
    ws.send(JSON.stringify({ sender: 'AI', type: 'stream_continue', aiResponse: chunk.choices[0].delta }));
    responseText += chunk.choices[0].delta.content;
   }
  }
  const fullResponse = { role: 'assistant', content: responseText };
  newHistory.push(fullResponse);
 } else {
  const fullResponse = await aiResponse.choices[0].message;
  logger.info(`AI Full Response: , ${fullResponse.content}`);
  newHistory.push(fullResponse);

  ws.send(
   JSON.stringify({
    sender: 'AI',
    type: 'stream_continue',
    aiResponse: { ...fullResponse, content: `Related || ${isRelated} || ${fullResponse.content}` },
    id: message.id,
   })
  );
 }
 ws.send(JSON.stringify({ sender: 'AI', type: 'stream_end', id: message.id }));

 saveHistory(message.id, newHistory);
};

const historyObject = async (userId: string) => {
 const history = await redis.getValue(`chat_history_${userId}`);
 return history || [];
};
const saveHistory = async (userId: string, history: any) => {
 await redis.setValue(`chat_history_${userId}`, history);
};
