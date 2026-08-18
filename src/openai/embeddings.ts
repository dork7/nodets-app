import { createEmbeddings } from '@/openai';

const BATCH_SIZE = 16;

export interface EmbedOptions {
 provider?: string;
 model?: string;
}

export async function embedText(text: string, options?: EmbedOptions): Promise<number[]> {
 const [embedding] = await embedMany([text], options);
 return embedding;
}

export async function embedMany(texts: string[], options?: EmbedOptions): Promise<number[][]> {
 const normalized = texts.filter((text) => text && text.trim().length > 0);
 if (normalized.length === 0) {
  return [];
 }

 const embeddings: number[][] = [];

 for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
  const batch = normalized.slice(i, i + BATCH_SIZE);
  const batchEmbeddings = await createEmbeddings(batch, options);
  embeddings.push(...batchEmbeddings);
 }

 return embeddings;
}
