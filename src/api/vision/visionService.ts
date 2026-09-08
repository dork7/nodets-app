import { StatusCodes } from 'http-status-codes';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

import { ImageAnalysisMessage, ImageDetails } from '@/api/vision/visionModel';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { openai } from '@/openai';
import { openRouterAIInstance } from '@/openai/providers/openRouterAI';
import { logger } from '@/server';

const FALLBACK_MESSAGE = 'No readable text detected in the provided image.';
const DEFAULT_PROMPT =
 'Analyze this image and describe what you see in detail, including any text present in it.';

const extractJson = (content: string): unknown | string => {
 const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
 const candidate = codeBlockMatch ? codeBlockMatch[1] : content;

 const trimmed = candidate.trim();
 const startIdx = trimmed.indexOf('[');
 const endIdx = trimmed.lastIndexOf(']');
 const canParseArray = startIdx !== -1 && endIdx !== -1 && endIdx > startIdx;

 const start = canParseArray ? startIdx : trimmed.indexOf('{');
 const end = canParseArray ? endIdx : trimmed.lastIndexOf('}');

 if (start === -1 || end === -1 || end <= start) {
  return content;
 }

 try {
  return JSON.parse(trimmed.slice(start, end + 1));
 } catch {
  return content;
 }
};
export const OPENROUTER_PROVIDER = 'openrouter';

const isOpenRouter = (provider?: string): boolean =>
 provider?.trim().toLowerCase() === OPENROUTER_PROVIDER;

export const getDefaultVisionModel = (provider?: string): string => {
 if (isOpenRouter(provider)) {
  return env.OPENROUTER_VISION_MODEL;
 }
 return env.LOCALAI_IMAGE_ANALYSIS_MODEL;
};

export const visionService = {
 extractImageDetails: async (
  file: Express.Multer.File | undefined,
  prompt?: string,
  provider?: string,
  model?: string
 ): Promise<ServiceResponse<ImageDetails | null>> => {
  if (!file) {
   return new ServiceResponse<ImageDetails | null>(
    ResponseStatus.Failed,
    'Image file is required under the "image" form field.',
    null,
    StatusCodes.BAD_REQUEST
   );
  }

  try {
   const imageDataUrl = `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`;
   const aiModel = model ?? getDefaultVisionModel(provider);
   const client = isOpenRouter(provider) ? openRouterAIInstance : openai;

   const modelArgs = {
    model: aiModel,
    messages: [
     {
      role: 'user',
      content: [
       {
        type: 'text',
        text:
         `${prompt?.trim() ?? DEFAULT_PROMPT}`, 
       },
       { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
     },
    ],
   };
   const completion = await client.chat.completions.create(
    modelArgs as ChatCompletionCreateParamsNonStreaming & { stream: false }
   );

   const message = completion.choices[0]?.message as ImageAnalysisMessage | undefined;
   const rawText = message?.content?.trim() || FALLBACK_MESSAGE;
   const reasoning = message?.reasoning?.trim() || undefined;
   const details = extractJson(rawText) as ImageDetails['details'];

   const responsePayload: ImageDetails = {
    details,
    rawText,
    ...(reasoning ? { reasoning } : {}),
   };

   return new ServiceResponse<ImageDetails>(
    ResponseStatus.Success,
    'Image processed successfully.',
    responsePayload,
    StatusCodes.OK
   );
  } catch (error) {
   const errorMessage = `Failed to process the image with AI: ${(error as Error).message}`;
   logger.error(errorMessage, error);

   return new ServiceResponse<ImageDetails | null>(
    ResponseStatus.Failed,
    errorMessage,
    null,
    StatusCodes.INTERNAL_SERVER_ERROR,
    error
   );
  }
 },
};
