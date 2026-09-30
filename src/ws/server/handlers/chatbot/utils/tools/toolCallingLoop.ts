import { callAI } from '@/config/openaiConfig';
import { executeToolCalls, type ToolCallRequest, toOpenAITools } from '@/config/openaiConfig/tools';

import { AIResponse, AIResponseChunk, ChatMessage } from '../../types';
import { handleNonStreamingResponse } from '../response/nonStreamingResponse';
import { handleStreamingResponse } from '../response/streamingResponse';
import { TokenUsage } from '../usage/tokenUsage';

// Allow the model a few rounds of tool calling before forcing an answer.
const MAX_TOOL_ITERATIONS = 5;

interface ToolCallingLoopOptions {
 ws: any;
 aiModel: string;
 provider: string;
 aiMessages: any[];
 conversationHistory: ChatMessage[];
 messageId: string;
 isRelated: boolean;
 isStreaming: boolean;
 abortSignal: AbortSignal;
}

export const runToolCallingLoop = async ({
 ws,
 aiModel,
 provider,
 aiMessages,
 conversationHistory,
 messageId,
 isRelated,
 isStreaming,
 abortSignal,
}: ToolCallingLoopOptions): Promise<TokenUsage> => {
 let tokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

 for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
  if (abortSignal.aborted) {
   break;
  }

  // Get AI response (tools are offered every round so it can keep asking)
  const aiResponse = await callAI(
   aiModel,
   aiMessages,
   { stream: isStreaming, tools: toOpenAITools(), provider },
   abortSignal
  );

  // Handle response based on streaming mode and get token usage
  let toolCalls: ToolCallRequest[];
  if (isStreaming) {
   const streamingResult = await handleStreamingResponse(
    ws,
    aiResponse as AsyncIterable<AIResponseChunk>,
    conversationHistory,
    messageId,
    isRelated,
    abortSignal
   );
   tokenUsage = streamingResult.tokenUsage;
   toolCalls = streamingResult.toolCalls;
  } else {
   const nonStreamingResult = await handleNonStreamingResponse(
    ws,
    aiResponse as AIResponse,
    conversationHistory,
    messageId,
    isRelated
   );
   tokenUsage = nonStreamingResult.tokenUsage;
   toolCalls = nonStreamingResult.toolCalls;
  }

  if (!toolCalls.length) {
   break;
  }

  // Feed the assistant's tool-call request back so its next turn knows WHY it
  // called the tool (the API/best practice requires this exact shape).
  aiMessages.push({
   role: 'assistant',
   content: null,
   tool_calls: toolCalls.map((tc) => ({
    id: tc.id,
    type: 'function',
    function: { name: tc.name, arguments: tc.arguments },
   })),
  });

  // Actually run the tools, then attach each result as a `tool` message.
  const toolResults = await executeToolCalls(toolCalls);
  for (const result of toolResults) {
   aiMessages.push({ role: 'tool', tool_call_id: result.id, content: result.output });
  }
 }

 return tokenUsage;
};
