import { callAI, isRelatedConversation } from '@/openai';
import { logger } from '@/server';
import { redis } from '@/services/redisStore';

// ===== Types =====
interface ChatMessage {
 role: 'user' | 'assistant' | 'system';
 content: string;
}

interface WebSocketMessage {
 id: string;
 method?: string;
 model?: string;
 stream?: boolean | string;
 params?: {
  prompt?: string;
 };
}

interface AIResponseChunk {
 choices?: Array<{
  delta?: {
   content?: string;
  };
 }>;
}

interface AIResponse {
 choices: Array<{
  message: ChatMessage;
 }>;
}

// ===== Constants =====
const DEFAULT_PROMPT = 'Hello, AI!';
const HISTORY_KEY_PREFIX = 'chat_history_';

// ===== Helper Functions =====
const getHistoryKey = (userId: string): string => `${HISTORY_KEY_PREFIX}${userId}`;

const normalizeStreamParam = (streamParam: boolean | string | undefined): boolean => {
 if (streamParam === 'false' || streamParam === false) {
  return false;
 }
 return Boolean(streamParam);
};

const getPreviousMessageContent = (history: ChatMessage[]): string => {
 return history.length > 0 ? history[history.length - 1].content : '';
};

const buildConversationHistory = (userInput: string, previousHistory: ChatMessage[], isRelated: boolean): ChatMessage[] => {
 const newHistory: ChatMessage[] = [{ role: 'user', content: userInput }];

 if (isRelated && previousHistory.length > 0) {
  newHistory.unshift(...previousHistory);
 }

 return newHistory;
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
  const history = await redis.getValue(getHistoryKey(userId));
  return Array.isArray(history) ? history : [];
 } catch (error) {
  logger.error(`Error retrieving chat history for user ${userId}: ${error}`);
  return [];
 }
};

const saveChatHistory = async (userId: string, history: ChatMessage[]): Promise<void> => {
 try {
  await redis.setValue(getHistoryKey(userId), history);
 } catch (error) {
  logger.error(`Error saving chat history for user ${userId}: ${error}`);
 }
};

// ===== Streaming Response Handler =====
const handleStreamingResponse = async (
 ws: any,
 aiResponse: AsyncIterable<AIResponseChunk>,
 conversationHistory: ChatMessage[],
 messageId: string,
 isRelated: boolean
): Promise<void> => {
 let responseText = '';

 try {
  for await (const chunk of aiResponse) {
   const choices = chunk.choices;
   const content = choices?.[0]?.delta?.content;
   if (content && choices?.[0]?.delta) {
    logger.info(`AI Response Chunk: ${content}`);
    sendWebSocketMessage(ws, {
     sender: 'AI',
     type: 'stream_continue',
     aiResponse: choices[0].delta,
     isRelated,
    });
    responseText += content;
   }
  }

  const fullResponse: ChatMessage = { role: 'assistant', content: responseText };
  conversationHistory.push(fullResponse);
 } catch (error) {
  logger.error(`Error processing streaming response: ${error}`);
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
): Promise<void> => {
 try {
  const fullResponse = aiResponse.choices[0]?.message;
  if (!fullResponse) {
   throw new Error('No response message found in AI response');
  }

  logger.info(`AI Full Response: ${fullResponse.content}`);
  conversationHistory.push(fullResponse);

  sendWebSocketMessage(ws, {
   sender: 'AI',
   type: 'stream_continue',
   aiResponse: fullResponse,
   id: messageId,
   isRelated,
  });
 } catch (error) {
  logger.error(`Error processing non-streaming response: ${error}`);
  throw error;
 }
};

// ===== Main Handler =====
export const name = 'chatAI';

export const handler = async (ws: any, message: WebSocketMessage): Promise<void> => {
 try {
  // Extract and validate input
  const userInput = message.params?.prompt || DEFAULT_PROMPT;
  const globalModels = (global as { aiModels?: string[] })?.aiModels;
  const aiModel = message?.model || globalModels?.[0] || '';
  const isStreaming = normalizeStreamParam(message?.stream);

  // Get conversation history
  const previousHistory = await getChatHistory(message.id);

  // Check if conversation is related to previous context
  const previousMessageContent = getPreviousMessageContent(previousHistory);
  const isRelated = await isRelatedConversation(previousMessageContent, userInput, aiModel);

  // Build conversation history
  const conversationHistory = buildConversationHistory(userInput, previousHistory, isRelated);

  // Save updated history (before AI response)
  await saveChatHistory(message.id, conversationHistory);

  // Send stream start notification
  sendWebSocketMessage(ws, {
   sender: 'AI',
   type: 'stream_start',
   id: message.id,
   isRelated,
  });

  // Get AI response
  const aiResponse = await callAI(conversationHistory as [], isStreaming, aiModel);

  // Handle response based on streaming mode
  if (isStreaming) {
   await handleStreamingResponse(ws, aiResponse as AsyncIterable<AIResponseChunk>, conversationHistory, message.id, isRelated);
  } else {
   await handleNonStreamingResponse(ws, aiResponse as AIResponse, conversationHistory, message.id, isRelated);
  }

  // Send stream end notification
  sendWebSocketMessage(ws, {
   sender: 'AI',
   type: 'stream_end',
   id: message.id,
   isRelated,
  });

  // Save final conversation history
  await saveChatHistory(message.id, conversationHistory);
 } catch (error) {
  logger.error(`Error in chatAI handler: ${error}`);
  sendWebSocketMessage(ws, {
   sender: 'AI',
   type: 'error',
   id: message.id,
   error: 'An error occurred while processing your request.',
  });
 }
};
