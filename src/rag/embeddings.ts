import { Embeddings } from '@langchain/core/embeddings';

import { embedModel } from '@/config/llamaConfig';

/**
 * LangChain adapter over the embedding model the project's Qdrant pipeline already
 * uses (`OPENROUTER_EMBED_MODEL`), so no second embedding provider is introduced.
 */
class ProjectEmbeddings extends Embeddings {
 embedDocuments(texts: string[]): Promise<number[][]> {
  return embedModel.getTextEmbeddingsBatch(texts);
 }

 async embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedModel.getTextEmbeddingsBatch([text]);
  return vector;
 }
}

// The model has no separate document/query modes, so both roles share one instance.
export const documentEmbeddings = new ProjectEmbeddings({});
export const queryEmbeddings = documentEmbeddings;
