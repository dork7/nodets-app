import { env } from '@/common/utils/envConfig';
import { embedMany } from '@/openai/embeddings';
import { logger } from '@/server';
import { queryCollection } from '@/services/vectorStore';

export interface RagChunk {
 id: string;
 text: string;
 score: number;
 source?: string;
}

export interface RagRetrieval {
 systemPrompt: string;
 sources: RagChunk[];
}

/**
 * Embed the user's message, query ChromaDB, and (only when a match is found) build a
 * system prompt that grounds the LLM in the retrieved chunks.
 *
 * Fails open: any embedding/vector-store error returns `null` so the chat turn continues
 * without RAG rather than erroring out.
 *
 * @param maxDistance optional Chroma distance ceiling (lower = closer). `undefined`/`0`
 *                    means "no threshold" — take whatever the top-k query returns.
 */
export const retrieveRagContext = async (query: string, maxDistance?: number): Promise<RagRetrieval | null> => {
 try {
  const [embedding] = await embedMany([query]);
  if (!embedding) {
   return null;
  }

  const matches = await queryCollection(embedding, env.RAG_TOP_K);
  const threshold = maxDistance && maxDistance > 0 ? maxDistance : Infinity;

  const chunks: RagChunk[] = matches
   .filter((match) => match.text && match.score <= threshold)
   .map((match) => ({
    id: match.id,
    text: match.text,
    score: match.score,
    source: (match.metadata?.source as string) || undefined,
   }));

  if (chunks.length === 0) {
   return null;
  }

  const systemPrompt =
   `Answer the user's question using only the context below. ` +
   `If the context does not contain the answer, say you don't know.\n\nContext:\n` +
   chunks.map((chunk, index) => `[${index + 1}] ${chunk.text}`).join('\n\n');

  return { systemPrompt, sources: chunks };
 } catch (error) {
  logger.error(`RAG retrieval failed, continuing without context: ${(error as Error).message}`);
  return null;
 }
};
