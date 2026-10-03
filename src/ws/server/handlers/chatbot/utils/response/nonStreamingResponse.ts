import { type ToolCallRequest } from '@/config/openaiConfig/tools';
import { logger } from '@/server';

import { AIResponse, ChatMessage } from '../../types';
import { TokenUsage } from '../usage/tokenUsage';
import { sendWebSocketMessage } from '../ws/messaging';

export const handleNonStreamingResponse = async (
 ws: any,
 aiResponse: AIResponse,
 conversationHistory: ChatMessage[],
 messageId: string
): Promise<{ tokenUsage: TokenUsage; toolCalls: ToolCallRequest[] }> => {
 try {
  const fullResponse = aiResponse.choices[0]?.message;
  if (!fullResponse) {
   throw new Error('No response message found in AI response');
  }

  // Pull out any tool calls the model requested alongside (or instead of) text.
  const rawToolCalls = (
   fullResponse as { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }
  ).tool_calls;
  const toolCalls: ToolCallRequest[] = (rawToolCalls || [])
   .filter((tc) => tc.function?.name)
   .map((tc) => ({
    id: tc.id || '',
    name: tc.function?.name || '',
    arguments: tc.function?.arguments || '',
   }));

  logger.info(`AI Full Response: ${fullResponse.content}`);
  if (fullResponse.content) {
   conversationHistory.push(fullResponse);
  }

  sendWebSocketMessage(ws, {
   sender: 'AI',
   type: 'stream_continue',
   aiResponse: fullResponse,
   id: messageId,
  });

  return {
   tokenUsage: aiResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
   toolCalls,
  };
 } catch (error) {
  logger.error(`Error processing non-streaming response: ${error}`);
  throw error;
 }
};
