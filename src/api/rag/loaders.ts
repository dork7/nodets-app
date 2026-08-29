import { readFile } from 'fs/promises';
import path from 'path';

import { extractText } from '@/api/rag/extractText';
import { MINIO_BUCKET, minioClient } from '@/services/minio';

export interface LoadedDocument {
 id: string;
 text: string;
 source: string;
 meta: Record<string, unknown>;
}

const MAX_FILE_CHARS = 50000;

const readMinioObject = async (id: string, bucket: string): Promise<{ buffer: Buffer; name: string } | null> => {
 const files: any[] = [];
 for await (const obj of minioClient.listObjects(bucket, `${id}-`, true)) {
  files.push(obj);
 }

 const file = files.find((f) => f.name.startsWith(`${id}-`));
 if (!file) {
  return null;
 }

 const stream = await minioClient.getObject(bucket, file.name);
 const chunks: Buffer[] = [];
 for await (const chunk of stream as AsyncIterable<Buffer>) {
  chunks.push(chunk);
 }

 return {
  buffer: Buffer.concat(chunks),
  name: file.name.replace(`${id}-`, ''),
 };
};

export const loaders = {
 json: async (): Promise<LoadedDocument[]> => {
  const raw = await readFile(path.join(process.cwd(), 'data.json'), 'utf-8');
  const entries = JSON.parse(raw) as { id: string | number; text: string }[];
  return entries.map((entry) => ({
   id: String(entry.id),
   text: entry.text,
   source: 'json',
   meta: { source: 'data.json' },
  }));
 },

 minio: async (fileId: string, bucket?: string): Promise<LoadedDocument[]> => {
  const targetBucket = bucket || MINIO_BUCKET;
  const file = await readMinioObject(fileId, targetBucket);
  if (!file) {
   throw new Error(`File ${fileId} not found in bucket ${targetBucket}`);
  }

  const text = (await extractText(file.buffer, file.name)).slice(0, MAX_FILE_CHARS);
  if (!text.trim()) {
   throw new Error(`No extractable text found in "${file.name}".`);
  }

  return [
   {
    id: fileId,
    text,
    source: 'minio',
    meta: { source: 'minio', filename: file.name, bucket: targetBucket },
   },
  ];
 },

 csv: async (text: string, name = 'csv'): Promise<LoadedDocument[]> => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((header) => header.trim());
  return lines.slice(1).map((line, index) => {
   const values = line.split(',').map((value) => value.trim());
   const record = headers.reduce<Record<string, string>>((acc, header, i) => {
    acc[header] = values[i] ?? '';
    return acc;
   }, {});
   return {
    id: `csv-${name}-${index}`,
    text: Object.entries(record)
     .map(([key, value]) => `${key}: ${value}`)
     .join('\n'),
    source: 'csv',
    meta: { source: 'csv', filename: name },
   };
  });
 },

 url: async (url: string): Promise<LoadedDocument[]> => {
  const response = await fetch(url);
  if (!response.ok) {
   throw new Error(`URL ${url} returned status ${response.status}`);
  }
  const html = await response.text();
  const text = html
   .replace(/<script[\s\S]*?<\/script>/gi, ' ')
   .replace(/<style[\s\S]*?<\/style>/gi, ' ')
   .replace(/<[^>]+>/g, ' ')
   .replace(/\s+/g, ' ')
   .trim();
  return [
   {
    id: `url-${url}`,
    text,
    source: 'url',
    meta: { source: 'url', url },
   },
  ];
 },
};
