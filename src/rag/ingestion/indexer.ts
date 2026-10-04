import type { Document } from '@langchain/core/documents';

import { documentEmbeddings } from '@/rag/embeddings';
import { deleteBlobsForDocument } from '@/rag/stores/blobs';
import * as docstore from '@/rag/stores/docstore';
import { deleteDocumentPoints, ensureCollection, vectorStore } from '@/rag/stores/qdrant';
import type { Child, Parent, RagDocument } from '@/rag/types';

const BATCH = 64;

/** The document was deleted while its job was running; there is nothing left to index, and retrying cannot help. */
export class DocumentGoneError extends Error {
 constructor(docId: string) {
  super(`Document ${docId} was deleted during ingestion`);
  this.name = 'DocumentGoneError';
 }
}

/** The job was reclaimed by another worker after this one lost its lock; this run must not write. */
export class LostLockError extends Error {
 constructor(jobId: string) {
  super(`Job ${jobId} is no longer held by this worker`);
  this.name = 'LostLockError';
 }
}

/** Everything the pipeline stored for a document except its registry row and original upload. */
async function removeIndexed(docId: string, keepBlobs: string[]) {
 await deleteDocumentPoints(docId);
 await docstore.deleteParents(docId);
 await deleteBlobsForDocument(docId, keepBlobs);
}

/**
 * Clears anything already stored for the document, then writes parents and vectors.
 * Clearing first is what makes job retries and re-ingestion safe. `stillOurs` is checked
 * before any write, and the document's existence before and after, so neither a
 * superseded run nor a concurrent delete can leave vectors behind.
 */
export async function indexDocument(
 doc: RagDocument,
 parents: Parent[],
 children: Child[],
 stillOurs: () => Promise<boolean> = async () => true
): Promise<number> {
 if (!(await stillOurs())) throw new LostLockError(doc._id);
 if (!(await docstore.getDocument(doc._id))) throw new DocumentGoneError(doc._id);

 await ensureCollection();
 await deleteDocumentPoints(doc._id);
 await docstore.replaceParents(doc._id, parents);
 // Images saved by earlier, failed or superseded attempts are no longer referenced by any parent.
 await deleteBlobsForDocument(doc._id, [doc.blobId, ...parents.flatMap((p) => (p.blobId ? [p.blobId] : []))]);

 const store = vectorStore(documentEmbeddings);
 const createdAt = new Date().toISOString();
 const documents: Document[] = children.map((child) => ({
  pageContent: child.content,
  metadata: {
   // Free-form metadata first, so it can never overwrite the fields retrieval filters on.
   ...doc.metadata,
   chunkId: child.chunkId,
   docId: doc._id,
   parentId: child.parentId,
   modality: child.modality,
   collection: doc.collection,
   filename: doc.filename,
   page: child.page,
   sectionPath: child.sectionPath,
   acl: doc.acl,
   createdAt,
  },
 }));
 for (let i = 0; i < documents.length; i += BATCH) {
  await store.addDocuments(documents.slice(i, i + BATCH));
 }

 // A delete that arrived while we were writing found nothing to remove; undo what was just written.
 if (!(await docstore.getDocument(doc._id))) {
  await removeIndexed(doc._id, []);
  throw new DocumentGoneError(doc._id);
 }
 return documents.length;
}
