import { callAI } from '@/config/openaiConfig';
import { executeToolCalls, type ToolCallRequest, toOpenAITools } from '@/config/openaiConfig/tools';
import { ChatHistoryModel } from '@/models/chatHistory.model';
import { logger } from '@/server';
import { monitorService } from '@/services/monitorService';

import { buildConversationHistory, getSummeriseHistory } from './utils/history';
import { addAttachmentsToLastMsg, getFileText, getImageDataUrl } from './utils/imageHandler';
import { type RagChunk, retrieveRagContext } from './utils/ragContext';
import { isRelatedConversation } from './utils/relationCheck';
import { saveTokenUsage, TokenUsage } from './utils/tokenUsage';

// ===== Types =====
export interface ChatMessage {
 role: 'user' | 'assistant' | 'system';
 content: string;
}

interface WebSocketMessage {
 id: string;
 method?: string;
 type?: string;
 model?: string;
 provider?: string;
 stream?: boolean | string;
 rag?: boolean;
 ragDistance?: number;
 params?: {
  prompt?: string;
  imageId?: string;
  imageIds?: string[];
  fileIds?: string[];
 };
}

interface DeltaToolCall {
 index?: number;
 id?: string;
 function?: unknown;
 type?: string;
}

interface AIResponseChunk {
 choices?: Array<{
  delta?: {
   content?: string;
   tool_calls?: DeltaToolCall[];
  };
  finish_reason?: string | null;
 }>;
 usage?: TokenUsage;
}

interface AIResponse {
 choices: Array<{
  message: ChatMessage;
 }>;
 usage?: TokenUsage;
}

// ===== Constants =====
const DEFAULT_PROMPT = 'Hello, AI!';
const activeAIRequests = new Map<string, AbortController>();

// ===== Helper Functions =====
const normalizeStreamParam = (streamParam: boolean | string | undefined): boolean => {
 if (streamParam === 'false' || streamParam === false) {
  return false;
 }
 return Boolean(streamParam);
};

const isStopStreamMessage = (message: WebSocketMessage): boolean => message.type === 'stop_stream';

const getErrorMessage = (error: unknown): string => {
 if (error instanceof Error && error.message) {
  return error.message;
 }

 if (typeof error === 'string') {
  return error;
 }

 return 'An error occurred while processing your request.';
};

const formatRequestTime = (timestamp: number): string =>
 new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });

const sendStreamError = (ws: any, messageId: string, error: unknown): void => {
 sendWebSocketMessage(ws, {
  sender: 'AI',
  type: 'stream_error',
  id: messageId,
  error: getErrorMessage(error),
 });
};

const getPreviousMessageContent = (history: ChatMessage[]): string => {
 return history.length > 0 ? history[history.length - 1].content : '';
};

const sendWebSocketMessage = (ws: any, message: Record<string, unknown>): void => {
 try {
  ws.send(JSON.stringify(message));
 } catch (error) {
  logger.error(`Error sending WebSocket message: ${error}`);
 }
};

// ===== History Management =====
const getChatHistory = async (userId: string): Promise<ChatMessage[]> => {
 try {
  const doc = await ChatHistoryModel.findOne({ userId }).lean();
  return doc?.history ?? [];
 } catch (error) {
  logger.error(`Error retrieving chat history for user ${userId}: ${error}`);
  return [];
 }
};

const saveChatHistory = async (userId: string, history: ChatMessage[]): Promise<void> => {
 try {
  await ChatHistoryModel.findOneAndUpdate(
   { userId },
   { history, updatedAt: new Date() },
   { upsert: true }
  );
 } catch (error) {
  logger.error(`Error saving chat history for user ${userId}: ${error}`);
 }
};

// ===== Token Usage Management =====

// ===== Streaming Response Handler =====
const handleStreamingResponse = async (
 ws: any,
 aiResponse: AsyncIterable<AIResponseChunk>,
 conversationHistory: ChatMessage[],
 messageId: string,
 isRelated: boolean,
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
     isRelated,
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

// ===== Non-Streaming Response Handler =====
const handleNonStreamingResponse = async (
 ws: any,
 aiResponse: AIResponse,
 conversationHistory: ChatMessage[],
 messageId: string,
 isRelated: boolean
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
   isRelated,
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

// ===== Main Handler =====
export const name = 'chatAI';

export const chatbotHandler = async (ws: any, message: WebSocketMessage): Promise<void> => {
 if (isStopStreamMessage(message)) {
  const activeRequest = activeAIRequests.get(message.id);
  if (activeRequest) {
   activeRequest.abort();
  } else {
   sendWebSocketMessage(ws, {
    sender: 'AI',
    type: 'stream_stopped',
    id: message.id,
   });
  }
  return;
 }

 const abortController = new AbortController();
 activeAIRequests.get(message.id)?.abort();
 activeAIRequests.set(message.id, abortController);

 const requestStartTime = Date.now();

 // Hoisted so the monitor logging in catch/finally can see them.
 const userInput = message.params?.prompt || DEFAULT_PROMPT;
 const globalModels = (global as { aiModels?: string[] })?.aiModels;
 const aiModel = message?.model || globalModels?.[0] || 'default';
 const provider = message?.provider || 'localAI';
 let monitorTokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
 let monitorStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
 let monitorError: string | undefined;

 try {
  // Extract and validate input
  const imageIds = message.params?.imageIds || (message.params?.imageId ? [message.params.imageId] : []);
  const fileIds = message.params?.fileIds || [];
  const isStreaming = normalizeStreamParam(message?.stream);

  logger.info(
   `[chatAI] Request start at ${formatRequestTime(requestStartTime)} for session ${message.id} (provider: ${provider}, model: ${aiModel || 'default'})`
  );

  // Resolve uploaded images to base64 data URLs (if any)
  const imageDataUrls = (await Promise.all(imageIds.map(getImageDataUrl))).filter((url): url is string => Boolean(url));

  // Resolve non-image uploads to their text content (if any)
  const fileTexts = (await Promise.all(fileIds.map(getFileText))).filter(
   (file): file is { text: string; name: string } => Boolean(file)
  );

  // Get conversation history
  const previousHistory = await getChatHistory(message.id);

  // Check if conversation is related to previous context
  const previousMessageContent = getPreviousMessageContent(previousHistory);

  //   const summeriseHistory:any = await getSummeriseHistory(previousMessageContent);

  const isRelated = await isRelatedConversation(previousMessageContent, userInput, aiModel);

  // Build conversation history
  const conversationHistory = buildConversationHistory(userInput, previousHistory, true);

  // Save updated history (before AI response)
  await saveChatHistory(message.id, conversationHistory);

  // Build OpenAI messages, attaching the images to the last user message if present
  const aiMessages = addAttachmentsToLastMsg(conversationHistory, imageDataUrls, fileTexts);

  // RAG: when enabled, retrieve context from the vector store and inject it as a system
  // message. Injected into `aiMessages` only (never `conversationHistory`) so the context
  // is not persisted to MongoDB and re-injected on later turns. Fails open.
  let ragSources: RagChunk[] = [];
  if (message.rag) {
   const retrieval = await retrieveRagContext(userInput, message.ragDistance);
   if (retrieval) {
    aiMessages.unshift({ role: 'system', content: retrieval.systemPrompt });
    ragSources = retrieval.sources;
    logger.info(`[chatAI] RAG injected ${ragSources.length} chunk(s) for session ${message.id}`);
   }
  }

  // Send stream start notification
  sendWebSocketMessage(ws, {
   sender: 'AI',
   type: 'stream_start',
   id: message.id,
   isRelated,
   requestStartTime,
   ragSources,
  });

  // Allow the model a few rounds of tool calling before forcing an answer.
  const MAX_TOOL_ITERATIONS = 5;
  let tokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
   if (abortController.signal.aborted) {
    break;
   }

   // Get AI response (tools are offered every round so it can keep asking)
   const aiResponse = await callAI(
    aiModel,
    aiMessages,
    { stream: isStreaming, tools: toOpenAITools(), provider },
    abortController.signal as AbortSignal
   );

   // Handle response based on streaming mode and get token usage
   let toolCalls: ToolCallRequest[];
   if (isStreaming) {
    const streamingResult = await handleStreamingResponse(
     ws,
     aiResponse as AsyncIterable<AIResponseChunk>,
     conversationHistory,
     message.id,
     isRelated,
     abortController.signal
    );
    tokenUsage = streamingResult.tokenUsage;
    toolCalls = streamingResult.toolCalls;
   } else {
    const nonStreamingResult = await handleNonStreamingResponse(
     ws,
     aiResponse as AIResponse,
     conversationHistory,
     message.id,
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

  // Save token usage
  monitorTokenUsage = tokenUsage;
  if (tokenUsage.total_tokens && tokenUsage.total_tokens > 0) {
   await saveTokenUsage(message.id, tokenUsage);
  }

  // Send stream end notification with token usage
  sendWebSocketMessage(ws, {
   sender: 'AI',
   type: abortController.signal.aborted ? 'stream_stopped' : 'stream_end',
   id: message.id,
   isRelated,
   tokenUsage,
   ragSources,
   requestStartTime,
   requestEndTime: Date.now(),
  });

  // Save final conversation history
  await saveChatHistory(message.id, conversationHistory);
 } catch (error) {
  if (abortController.signal.aborted) {
   sendWebSocketMessage(ws, {
    sender: 'AI',
    type: 'stream_stopped',
    id: message.id,
    requestStartTime,
    requestEndTime: Date.now(),
   });
   return;
  }

  monitorStatus = 'FAILED';
  monitorError = getErrorMessage(error);
  logger.error(`Error in chatAI handler: ${monitorError}`);
  sendStreamError(ws, message.id, error);
 } finally {
  const requestEndTime = Date.now();
  logger.info(
   `[chatAI] Request end at ${formatRequestTime(requestEndTime)} for session ${message.id} (duration: ${requestEndTime - requestStartTime}ms)`
  );

  // Record the call for the monitor dashboard (skip user-aborted requests).
  if (!abortController.signal.aborted) {
   await monitorService.logCall(
    provider,
    aiModel,
    monitorStatus,
    requestEndTime - requestStartTime,
    userInput,
    monitorError,
    message.id,
    monitorTokenUsage
   );
  }

  if (activeAIRequests.get(message.id) === abortController) {
   activeAIRequests.delete(message.id);
  }
 }
};
