import { logger } from '@/server';
import { MINIO_BUCKET, minioClient } from '@/services/minio';

import { ChatMessage } from '../../chatAI';

const MAX_FILE_CHARS = 50000;

export const getImageDataUrl = async (id: string): Promise<string | null> => {
 try {
  const files: any[] = [];
  for await (const obj of minioClient.listObjects(MINIO_BUCKET, `${id}-`, true)) {
   files.push(obj);
  }

  const file = files.find((f) => f.name.startsWith(`${id}-`));
  if (!file) {
   logger.error(`Image not found for id ${id}`);
   return null;
  }

  const stream = await minioClient.getObject(MINIO_BUCKET, file.name);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
   chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const mimetype = file.contentType || 'application/octet-stream';
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
 } catch (ex) {
  logger.error(`Error fetching image ${id}: ${(ex as Error).message}`);
  return null;
 }
};

export const getFileText = async (id: string): Promise<{ text: string; name: string; mimetype?: string } | null> => {
 try {
  const files: any[] = [];
  for await (const obj of minioClient.listObjects(MINIO_BUCKET, `${id}-`, true)) {
   files.push(obj);
  }

  const file = files.find((f) => f.name.startsWith(`${id}-`));
  if (!file) {
   logger.error(`File not found for id ${id}`);
   return null;
  }

  const stream = await minioClient.getObject(MINIO_BUCKET, file.name);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
   chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const name = file.name.replace(`${id}-`, '');
  const text = buffer.toString('utf-8').slice(0, MAX_FILE_CHARS);

  return {
   text,
   name,
   mimetype: file.contentType || 'application/octet-stream',
  };
 } catch (ex) {
  logger.error(`Error fetching file ${id}: ${(ex as Error).message}`);
  return null;
 }
};

export const addAttachmentsToLastMsg = (
 conversationHistory: ChatMessage[],
 imageDataUrls: string[] = [],
 fileTexts: { text: string; name: string }[] = []
): any[] => {
 const messages: any[] = conversationHistory.map((m) => ({ role: m.role, content: m.content }));

 if (imageDataUrls.length === 0 && fileTexts.length === 0) {
  return messages;
 }

 const lastIndex = messages.length - 1;
 const lastMessage = messages[lastIndex];
 if (lastMessage && lastMessage.role === 'user') {
  const contentParts: any[] = [{ type: 'text', text: lastMessage.content }];

  for (const file of fileTexts) {
   contentParts.push({ type: 'text', text: `[Attachment: ${file.name}]\n${file.text}` });
  }

  for (const url of imageDataUrls) {
   contentParts.push({ type: 'image_url', image_url: { url } });
  }

  lastMessage.content = contentParts;
 }

 return messages;
};
