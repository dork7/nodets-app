import { StatusCodes } from 'http-status-codes';

import { ImageAnalysisMessage, ImageDetails } from '@/api/vision/visionModel';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { openai } from '@/openai';
import { logger } from '@/server';

const FALLBACK_MESSAGE = 'No readable text detected in the provided image.';
const DEFAULT_PROMPT =
 'Analyze this image and describe what you see in detail, including any text present in it. Return the calories and other nutritional information if present.';

const extractJson = (content: string): unknown | string => {
 const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
 const candidate = codeBlockMatch ? codeBlockMatch[1] : content;

 const start = candidate.indexOf('{');
 const end = candidate.lastIndexOf('}');

 if (start === -1 || end === -1 || end <= start) {
  return content;
 }

 try {
  return JSON.parse(candidate.slice(start, end + 1));
 } catch {
  return content;
 }
};
export const getDefaultVisionModel = (): string => {
 return env.IMAGE_ANALYSIS_MODEL ?? 'gemma-4-26b-a4b-it-apex-i-quality';
};

export const visionService = {
 extractImageDetails: async (
  file: Express.Multer.File | undefined,
  prompt?: string
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
   const aiModel = getDefaultVisionModel();

   const completion = await openai.chat.completions.create({
    model: aiModel,
    messages: [
     {
      role: 'user',
      content: [
       {
        type: 'text',
        text:
         `If user is asking about food image and calroies, you must answer based on your best possible knowledge. Give a stucture response in object format with calories and other nutritional information if present. ${prompt?.trim()}` ||
         DEFAULT_PROMPT,
       },
       { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
     },
    ],
   });

   const message = completion.choices[0]?.message as ImageAnalysisMessage | undefined;
   const rawText = message?.content?.trim() || FALLBACK_MESSAGE;
   const reasoning = message?.reasoning?.trim() || undefined;
   const details = extractJson(rawText);

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
