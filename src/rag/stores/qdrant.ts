import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { QdrantVectorStore } from '@langchain/qdrant';

import { getQdrantVectorStore } from '@/config/qdrantStore';
import { config } from '@/rag/config';

// Every field a retrieval filter can name must be indexed: Qdrant Cloud's strict mode rejects filters on unindexed fields.
const PAYLOAD_INDEX_FIELDS = [
 'metadata.docId',
 'metadata.collection',
 'metadata.modality',
 'metadata.acl',
 'metadata.filename',
];

/** The QdrantClient the project already creates (inside its LlamaIndex store) - one client per process. */
export const qdrant = () => getQdrantVectorStore().client();

export function vectorStore(embeddings: EmbeddingsInterface) {
 return new QdrantVectorStore(embeddings, {
  client: qdrant() as never,
  collectionName: config.qdrantCollection,
 });
}

let ensured: Promise<void> | null = null;

/** Creates `rag_chunks` and its payload indexes when missing. Safe to call repeatedly; never touches other collections. */
export function ensureCollection(): Promise<void> {
 ensured ??= (async () => {
  const client = qdrant();
  const name = config.qdrantCollection;
  const { exists } = await client.collectionExists(name);
  if (!exists) {
   await client.createCollection(name, { vectors: { size: config.embeddingDim, distance: 'Cosine' } });
  }
  for (const field of PAYLOAD_INDEX_FIELDS) {
   await client.createPayloadIndex(name, { field_name: field, field_schema: 'keyword' });
  }
  await client.createPayloadIndex(name, { field_name: 'metadata.page', field_schema: 'integer' });
 })().catch((err) => {
  ensured = null;
  throw err;
 });
 return ensured;
}

export async function deleteDocumentPoints(docId: string) {
 // Deleting from a collection that was never created is a 404 in Qdrant; make sure it exists first.
 await ensureCollection();
 await qdrant().delete(config.qdrantCollection, {
  wait: true,
  filter: { must: [{ key: 'metadata.docId', match: { value: docId } }] },
 });
}
