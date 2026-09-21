import { QdrantVectorStore } from '@llamaindex/qdrant';

import { env } from '@/common/utils/envConfig';
import { embedModel } from '@/config/llamaConfig';

let vectorStore: QdrantVectorStore | null = null;

export const getQdrantVectorStore = (): QdrantVectorStore => {
 if (!vectorStore) {
  vectorStore = new QdrantVectorStore({
   url: env.QDRANT_URL,
   apiKey: env.QDRANT_API_KEY || undefined,
   collectionName: env.QDRANT_COLLECTION_NAME,
   embedModel,
  });
 }
 return vectorStore;
};
