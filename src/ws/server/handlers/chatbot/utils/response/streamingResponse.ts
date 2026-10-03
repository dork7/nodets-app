import { type ToolCallRequest } from '@/config/openaiConfig/tools';
import { logger } from '@/server';

import { AIResponseChunk, ChatMessage } from '../../types';
import { TokenUsage } from '../usage/tokenUsage';
import { getErrorMessage, sendWebSocketMessage } from '../ws/messaging';

export const handleStreamingResponse = async (
 ws: any,
 aiResponse: AsyncIterable<AIResponseChunk>,
 conversationHistory: ChatMessage[],
 messageId: string,
 abortSignal: AbortSignal
): Promise<{ tokenUsage: TokenUsage; toolCalls: ToolCallRequest[] }> => {
 let responseText = '';
 let tokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
 const toolCalls: ToolCallRequest[] = [];

 try {
  for await (const chunk of aiResponse) {
   if (abortSignal.aborted) {
    break;
   }

   const choices = chunk.choices;
   const delta = choices?.[0]?.delta;
   const content = delta?.content;

   // Extract token usage from chunk if available (usually in final chunk)
   if (chunk.usage) {
    tokenUsage = {
     prompt_tokens: chunk.usage.prompt_tokens || 0,
     completion_tokens: chunk.usage.completion_tokens || 0,
     total_tokens: chunk.usage.total_tokens || 0,
    };
    logger.info(`Token usage captured: ${JSON.stringify(tokenUsage)}`);
   }

   if (content && delta) {
    logger.info(`AI Response Chunk: ${content}`);
    sendWebSocketMessage(ws, {
     sender: 'AI',
     type: 'stream_continue',
     aiResponse: delta,
    });
    responseText += content;
   }

   // Each chunk carries ONLY a fragment of the tool call (id, name, and JSON
   // arguments arrive in separate pieces). Merge them by tool index.
   if (delta?.tool_calls) {
    for (const toolChunk of delta.tool_calls) {
     const idx = toolChunk.index ?? 0;
     const partial = toolChunk as { id?: string; function?: { name?: string; arguments?: string } };
     if (!toolCalls[idx]) {
      toolCalls[idx] = { id: '', name: '', arguments: '' };
     }
     if (partial.id) toolCalls[idx].id = partial.id;
     if (partial.function?.name) toolCalls[idx].name = partial.function.name;
     if (partial.function?.arguments) toolCalls[idx].arguments += partial.function.arguments;
    }
   }
  }

  if (responseText) {
   const fullResponse: ChatMessage = { role: 'assistant', content: responseText };
   conversationHistory.push(fullResponse);
  }

  return { tokenUsage, toolCalls: toolCalls.filter((c) => c.name) };
 } catch (error) {
  if (abortSignal.aborted) {
   return { tokenUsage, toolCalls: toolCalls.filter((c) => c.name) };
  }

  logger.error(`Error processing streaming response: ${getErrorMessage(error)}`);
  throw error;
 }
};
