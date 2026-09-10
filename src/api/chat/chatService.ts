import { StatusCodes } from 'http-status-codes';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

import { ChatCompletionMessage, ChatMessage, ChatResponse } from '@/api/chat/chatModel';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { openai } from '@/openai';
import { openRouterAIInstance } from '@/openai/providers/openRouterAI';
import { logger } from '@/server';
import { sendSlackNotification } from '@/common/utils/slack';
import { monitorService } from '@/services/monitorService';

const LOCALAI_PROVIDER = 'localai';
export const OPENROUTER_PROVIDER = 'openrouter';

const isOpenRouter = (provider?: string): boolean =>
 provider?.trim().toLowerCase() === OPENROUTER_PROVIDER;

export const getDefaultChatModel = (provider?: string): string =>
 isOpenRouter(provider) ? env.OPENROUTER_CHAT_MODEL : env.LOCALAI_CHAT_MODEL;

interface SendMessagesInput {
 messages?: ChatMessage[];
 prompt?: string;
 provider?: string;
 model?: string;
 temperature?: number;
}

export const chatService = {
 sendMessages: async ({
  messages,
  prompt,
  provider,
  model,
  temperature,
 }: SendMessagesInput): Promise<ServiceResponse<ChatResponse | null>> => {
  const conversation: ChatMessage[] =
   messages && messages.length > 0 ? messages : [{ role: 'user', content: (prompt ?? '').trim() }];

  if (conversation.length === 0 || conversation.every((message) => !message.content.trim())) {
   return new ServiceResponse<ChatResponse | null>(
    ResponseStatus.Failed,
    'At least one non-empty message is required.',
    null,
    StatusCodes.BAD_REQUEST
   );
  }

  const aiModel = model ?? getDefaultChatModel(provider);
  const providerName = isOpenRouter(provider) ? OPENROUTER_PROVIDER : LOCALAI_PROVIDER;
  const fullPrompt = conversation.map(m => `${m.role}: ${m.content}`).join('\n');
  const startTime = Date.now();

  try {
   const client = isOpenRouter(provider) ? openRouterAIInstance : openai;

   const completion = await client.chat.completions.create({
    model: aiModel,
    messages: conversation,
    ...(temperature !== undefined ? { temperature } : {}),
   } as ChatCompletionCreateParamsNonStreaming & { stream: false });

   const durationMs = Date.now() - startTime;

   const message = completion.choices[0]?.message as ChatCompletionMessage | undefined;
   const reply = message?.content?.trim() ?? '';
   const reasoning = message?.reasoning?.trim() || undefined;

   const responsePayload: ChatResponse = {
    reply,
    ...(reasoning ? { reasoning } : {}),
    model: aiModel,
    provider: providerName,
    ...(completion.usage
     ? {
      usage: {
       prompt_tokens: completion.usage.prompt_tokens,
       completion_tokens: completion.usage.completion_tokens,
       total_tokens: completion.usage.total_tokens,
      },
     }
     : {}),
   };

   await monitorService.logCall(
    providerName,
    aiModel,
    'SUCCESS',
    durationMs,
    prompt?.trim() || fullPrompt,
    undefined,
    undefined,
    completion.usage
     ? {
      prompt_tokens: completion.usage.prompt_tokens,
      completion_tokens: completion.usage.completion_tokens,
      total_tokens: completion.usage.total_tokens,
     }
     : undefined
   );

   return new ServiceResponse<ChatResponse>(
    ResponseStatus.Success,
    'Message processed successfully.',
    responsePayload,
    StatusCodes.OK
   );
  } catch (error) {
   const errorMessage = `Failed to process the chat request with AI: ${(error as Error).message}`;
   logger.error(errorMessage, error);

   try {
    await sendSlackNotification(errorMessage, 'ERROR');
   } catch (slackError) {
    logger.error('Failed to send Slack notification', slackError);
   }

   await monitorService.logCall(
    providerName,
    aiModel,
    'FAILED',
    Date.now() - startTime,
    fullPrompt,
    (error as Error).message
   );

   return new ServiceResponse<ChatResponse | null>(
    ResponseStatus.Failed,
    errorMessage,
    null,
    StatusCodes.INTERNAL_SERVER_ERROR,
    error
   );
  }
 },
};
