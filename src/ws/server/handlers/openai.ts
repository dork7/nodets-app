import { callAI } from '@/openai';

export const name = 'openai';

export const handler = async (ws: any, message: any) => {
 const prompt = message.params?.prompt || 'Hello, AI!';
 const model = message.model || '';
 const isStreaming = message.stream === 'false' || message.stream === false ? false : Boolean(message.stream);

 sendWebSocketMessage(ws, { type: 'stream_start', id: message.id });

 try {
  const aiResponse = await callAI(model, [{ role: 'user', content: prompt }], { stream: isStreaming });

  if (isStreaming && aiResponse && typeof (aiResponse as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
   for await (const chunk of aiResponse as AsyncIterable<any>) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
     sendWebSocketMessage(ws, {
      sender: 'AI',
      type: 'stream_continue',
      aiResponse: { content: delta },
      id: message.id,
     });
    }
   }
  } else {
   const content = (aiResponse as any)?.choices?.[0]?.message?.content || '';
   sendWebSocketMessage(ws, {
    sender: 'AI',
    type: 'stream_continue',
    aiResponse: { content },
    id: message.id,
   });
  }

  sendWebSocketMessage(ws, { type: 'stream_end', id: message.id });
 } catch (error) {
  const messageText = error instanceof Error ? error.message : String(error);
  sendWebSocketMessage(ws, {
   sender: 'AI',
   type: 'stream_error',
   id: message.id,
   error: messageText,
  });
 }
};

const sendWebSocketMessage = (ws: any, message: Record<string, unknown>): void => {
 try {
  ws.send(JSON.stringify(message));
 } catch (error) {
  console.error(`Error sending WebSocket message: ${error}`);
 }
};