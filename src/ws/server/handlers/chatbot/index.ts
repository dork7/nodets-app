import { DEFAULT_CHAT_PROMPT } from '@/config/prompt';
import { logger } from '@/server';
import { monitorService } from '@/services/monitorService';

import { RagChunk, WebSocketMessage } from './types';
import { addAttachmentsToLastMsg, getFileText, getImageDataUrl } from './utils/attachments/imageHandler';
import { getChatHistory, getPreviousMessageContent, saveChatHistory } from './utils/history/chatHistory';
import { buildConversationHistory } from './utils/history/conversation';
import { isRelatedConversation } from './utils/history/relationCheck';
import { injectRagContext } from './utils/rag/ragContext';
import { runToolCallingLoop } from './utils/tools/toolCallingLoop';
import { saveTokenUsage, TokenUsage } from './utils/usage/tokenUsage';
import { getErrorMessage, sendStreamError, sendWebSocketMessage } from './utils/ws/messaging';
import { formatRequestTime, isStopStreamMessage, normalizeStreamParam } from './utils/ws/request';

export type { ChatMessage, RagChunk } from './types';

// ===== Constants =====
const activeAIRequests = new Map<string, AbortController>();

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
 const userInput = message.params?.prompt || DEFAULT_CHAT_PROMPT;
 const globalModels = (global as { aiModels?: string[] })?.aiModels;
 const aiModel = message?.model || globalModels?.[0] || 'default';
 const provider = message?.provider || 'localAI';
 let monitorTokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
 let monitorStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
 let monitorError: string | undefined;

 try {
  // RAG retrieval is scoped per user, so a userId is mandatory whenever RAG is
  // requested - without it there is no way to know whose documents to search.
  const ragUserId = message.userId?.trim();
  if (message.rag && !ragUserId) {
   monitorStatus = 'FAILED';
   monitorError = 'userId is required when RAG is enabled';
   sendWebSocketMessage(ws, {
    sender: 'AI',
    type: 'stream_error',
    id: message.id,
    error: 'Please provide a User ID to use RAG.',
   });
   return;
  }

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

  // RAG: when enabled, inject retrieved context as a system message.
  let ragSources: RagChunk[] = [];
  if (message.rag && ragUserId) {
   ragSources = await injectRagContext(aiMessages, userInput, ragUserId, message.id);
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

  const tokenUsage = await runToolCallingLoop({
   ws,
   aiModel,
   provider,
   aiMessages,
   conversationHistory,
   messageId: message.id,
   isRelated,
   isStreaming,
   abortSignal: abortController.signal,
  });

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
