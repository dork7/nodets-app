import { StatusCodes } from 'http-status-codes';
import Tesseract from 'tesseract.js';

import { ImageDetails } from '@/api/vision/visionModel';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

const FALLBACK_MESSAGE = 'No readable text detected in the provided image.';
const OCR_LANGUAGE = 'eng';
const SUMMARY_LINE_LIMIT = 20;
const KEYWORD_MIN_CHARS = 3;

const sanitizeLines = (text: string) =>
 text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const extractKeywords = (prompt?: string) =>
 prompt
  ?.toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter((word) => word.length >= KEYWORD_MIN_CHARS) ?? [];

const emphasizePromptMatches = (lines: string[], prompt?: string) => {
 const keywords = extractKeywords(prompt);

 if (!keywords.length) {
  return null;
 }

 const matches = lines.filter((line) => {
  const lowerLine = line.toLowerCase();
  return keywords.some((keyword) => lowerLine.includes(keyword));
 });

 if (!matches.length) {
  return null;
 }

 return matches.slice(0, SUMMARY_LINE_LIMIT);
};

const formatLines = (lines: string[]) =>
 lines
  .slice(0, SUMMARY_LINE_LIMIT)
  .map((line, idx) => `${idx + 1}. ${line}`)
  .join('\n');

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
   const { data } = await Tesseract.recognize(file.buffer, OCR_LANGUAGE, {
    logger: (message) => logger.debug({ source: 'tesseract', message }),
   });

   const rawText = data.text?.trim() ?? '';
   const normalizedLines = sanitizeLines(rawText);
   const emphasizedLines = emphasizePromptMatches(normalizedLines, prompt);
   const details =
    (emphasizedLines && emphasizedLines.length ? formatLines(emphasizedLines) : formatLines(normalizedLines)) ||
    FALLBACK_MESSAGE;

   const responsePayload: ImageDetails = {
    details,
    rawText: rawText || FALLBACK_MESSAGE,
   };

   return new ServiceResponse<ImageDetails>(
    ResponseStatus.Success,
    'Image processed successfully.',
    responsePayload,
    StatusCodes.OK
   );
  } catch (error) {
   const errorMessage = `Failed to extract details from the image: ${(error as Error).message}`;
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

