import { StatusCodes } from 'http-status-codes';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

import { ImageAnalysisMessage, ImageDetails } from '@/api/vision/visionModel';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { openai } from '@/openai';
import { openRouterAIInstance } from '@/openai/openRouterAI';
import { logger } from '@/server';

const FALLBACK_MESSAGE = 'No readable text detected in the provided image.';
const DEFAULT_PROMPT =
 'Analyze this image and describe what you see in detail, including any text present in it. Return the calories and other nutritional information if present.';

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
export const getDefaultVisionModel = (useOpenRouter = false): string => {
 if (useOpenRouter) {
  return env.OPENROUTER_VISION_MODEL;
 }
 return env.LOCALAI_IMAGE_ANALYSIS_MODEL;
};

export const visionService = {
 extractImageDetails: async (
  file: Express.Multer.File | undefined,
  prompt?: string,
  useOpenRouter = false,
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
   const aiModel = model ?? getDefaultVisionModel(useOpenRouter);

   const modelArgs = {
    model: aiModel,
    messages: [
     {
      role: 'user',
      content: [
       {
        type: 'text',
        text:
         `If user is asking about food image and calroies, you must answer based on your best possible knowledge. Give a stucture response in object format with calories and other nutritional information if present. Always returnt he response in Array of objects for each food item. alway returnt he nutriaital details in this format {
	"details": [
		{
			"food_item": "Paneer (Spiced/Pan-fried)",
			"estimated_quantity": "150g",
			"calories": 420,
			"protein_g": 27,
			"fat_g": 33,
			"carbohydrates_g": 5,
			"fiber_g": 0
		},
		{
			"food_item": "Cooking Oil & Spices",
			"estimated_quantity": "1 tbsp",
			"calories": 90,
			"protein_g": 0,
			"fat_g": 10,
			"carbohydrates_g": 2,
			"fiber_g": 0
		},
		{
			"total_dish_estimate": "Entire Bowl",
			"total_calories": 537,
			"total_protein_g": 28,
			"total_fat_g": 43,
			"total_carbs_g": 13
		}
	]
}${prompt?.trim()}` || DEFAULT_PROMPT,
       },
       { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
     },
    ],
   };
   const completion = model
    ? await openai.chat.completions.create(modelArgs as ChatCompletionCreateParamsNonStreaming & { stream: false })
    : await openRouterAIInstance.chat.completions.create(
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
