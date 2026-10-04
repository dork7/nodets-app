import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { blobBucket, toObjectId } from '@/rag/stores/mongo';

/** Streams a file or buffer into GridFS `rag_blobs` and returns its id. */
export async function saveBlob(source: { path: string } | { buffer: Buffer }, filename: string, metadata: object) {
 const upload = blobBucket().openUploadStream(filename, { metadata });
 const input = 'path' in source ? createReadStream(source.path) : Readable.from([source.buffer]);
 await pipeline(input, upload);
 return String(upload.id);
}

export async function readBlob(blobId: string): Promise<Buffer> {
 const chunks: Buffer[] = [];
 for await (const chunk of blobBucket().openDownloadStream(toObjectId(blobId))) chunks.push(chunk as Buffer);
 return Buffer.concat(chunks);
}

/**
 * Removes every blob tagged with the document, except `keep`. Deleting by owner rather
 * than by reference also catches images left behind by failed or superseded attempts.
 */
export async function deleteBlobsForDocument(docId: string, keep: string[] = []) {
 const bucket = blobBucket();
 const kept = new Set(keep);
 for await (const file of bucket.find({ 'metadata.docId': docId })) {
  if (!kept.has(String(file._id))) await bucket.delete(file._id).catch(() => undefined);
 }
}

export async function deleteBlobs(blobIds: string[]) {
 const bucket = blobBucket();
 for (const id of blobIds) {
  // A blob already removed by an earlier, interrupted delete is not an error.
  await bucket.delete(toObjectId(id)).catch(() => undefined);
 }
}
