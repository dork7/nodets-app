import { config } from '@/rag/config';
import { getDb } from '@/rag/stores/mongo';
import { ensureCollection } from '@/rag/stores/qdrant';

/**
 * Creates the Qdrant collection, its payload indexes and the MongoDB indexes. Safe to
 * run repeatedly, and only ever touches `rag_chunks` and the `rag_*` collections.
 */
export async function bootstrapRag() {
 await ensureCollection();

 const db = getDb();
 const ttl = config.logRetentionDays > 0 ? { expireAfterSeconds: config.logRetentionDays * 86_400 } : {};

 await db
  .collection('rag_request_logs')
  .createIndexes([
   { key: { requestId: 1 }, unique: true },
   { key: { userId: 1, createdAt: -1 } },
   { key: { endpoint: 1, statusCode: 1, createdAt: -1 } },
   { key: { createdAt: 1 }, ...ttl },
  ]);
 await db
  .collection('rag_error_logs')
  .createIndexes([
   { key: { errorId: 1 }, unique: true },
   { key: { requestId: 1 } },
   { key: { jobId: 1 } },
   { key: { source: 1, stage: 1, createdAt: -1 } },
   { key: { createdAt: 1 }, ...ttl },
  ]);
 // Dedupe used to be unique per collection only; that index would reject a second user's upload of the same bytes.
 await db
  .collection('rag_documents')
  .dropIndex('collection_1_sha256_1')
  .catch(() => undefined);
 await db.collection('rag_documents').createIndex({ collection: 1, uploadedBy: 1, sha256: 1 }, { unique: true });
 await db.collection('rag_parents').createIndex({ docId: 1 });
 await db.collection('rag_jobs').createIndex({ status: 1, runAfter: 1, createdAt: 1 });
 await db.collection('rag_jobs').createIndex({ docId: 1, createdAt: -1 });
}
