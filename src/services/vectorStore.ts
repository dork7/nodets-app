import { ChromaClient, type Collection, type Metadata } from 'chromadb';

import { env } from '@/common/utils/envConfig';

const client = new ChromaClient({ path: env.CHROMA_URL });

export interface VectorItem {
 id: string;
 text: string;
 metadata?: Metadata;
}

async function getCollection(): Promise<Collection> {
 const name = env.RAG_COLLECTION_NAME;
 try {
  return await client.getCollection({ name });
 } catch {
  return await client.createCollection({ name });
 }
}

const BATCH_SIZE = 4;

async function upsertBatch(collection: Collection, items: VectorItem[], embeddings: number[][]): Promise<void> {
	await collection.upsert({
   ids: items.map((item) => item.id),
   embeddings,
   documents: items.map((item) => item.text),
   metadatas: items.map((item) => item.metadata ?? {}),
  });
}

export async function upsertMany(items: VectorItem[], embeddings: number[][]): Promise<void> {
	const collection = await getCollection();
	for (let i = 0; i < items.length; i += BATCH_SIZE) {
   const batchItems = items.slice(i, i + BATCH_SIZE);
   const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE);
   await upsertBatch(collection, batchItems, batchEmbeddings);
  }
}

export async function queryCollection(
 queryEmbedding: number[],
 topK: number
): Promise<{ text: string; id: string; metadata: Metadata | null; score: number }[]> {
 const collection = await getCollection();
 const result = await collection.query({
  queryEmbeddings: [queryEmbedding],
  nResults: topK,
 });

 const documents = result.documents[0] ?? [];
 const ids = result.ids[0] ?? [];
 const metadatas = result.metadatas[0] ?? [];
 const distances = result.distances[0] ?? [];

 return documents.map((text, index) => ({
  text: text ?? '',
  id: ids[index] ?? '',
  metadata: metadatas[index] ?? null,
  score: distances[index] ?? 0,
 }));
}

export async function clearCollection(): Promise<void> {
 const name = env.RAG_COLLECTION_NAME;
 try {
  await client.deleteCollection({ name });
 } catch {
  // collection does not exist — nothing to clear
 }
}

export async function countCollection(): Promise<number> {
 const collection = await getCollection();
 return collection.count();
}

export async function listCollections(): Promise<string[]> {
 const collections = await client.listCollections();
 return collections.map((collection) => collection.name);
}
