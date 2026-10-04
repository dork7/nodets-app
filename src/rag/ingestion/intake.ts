import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import path from 'node:path';

import { HttpError, newId } from '@/rag/graphUtils';
import { MIME } from '@/rag/ingestion/parsers';
import { deleteBlobs, saveBlob } from '@/rag/stores/blobs';
import * as docstore from '@/rag/stores/docstore';
import type { Principal, RagDocument, RagJob } from '@/rag/types';

export interface IngestFields {
 collection: string;
 metadata: Record<string, unknown>;
 acl?: string[];
 textFormat: 'plain' | 'markdown';
}

interface UploadInfo {
 filename: string;
 mimeType: string;
 sizeBytes: number;
 sha256: string;
}

export interface IntakeResult {
 jobId: string;
 docId: string;
 filename: string;
 status: string;
 mimeType: string;
 sizeBytes: number;
 sha256: string;
}

const starts = (head: Buffer, ...bytes: number[]) => bytes.every((b, i) => head[i] === b);

const ZIP_BY_EXT: Record<string, string> = { docx: MIME.docx, pptx: MIME.pptx, xlsx: MIME.xlsx };
const TEXT_BY_EXT: Record<string, string> = {
 csv: MIME.csv,
 html: MIME.html,
 htm: MIME.html,
 md: MIME.markdown,
 markdown: MIME.markdown,
 txt: MIME.text,
};

/**
 * Detects the real type from the file's first bytes. Text formats have no magic
 * bytes, so they fall back to the extension plus a "this is valid UTF-8 text" check.
 * Returns null for anything outside the allow-list.
 */
export function sniffType(head: Buffer, filename: string): string | null {
 const ext = path.extname(filename).slice(1).toLowerCase();
 if (head.subarray(0, 5).toString('latin1') === '%PDF-') return MIME.pdf;
 if (starts(head, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
 if (starts(head, 0xff, 0xd8, 0xff)) return 'image/jpeg';
 if (head.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
 if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') {
  return 'image/webp';
 }
 if (starts(head, 0x49, 0x49, 0x2a, 0x00) || starts(head, 0x4d, 0x4d, 0x00, 0x2a)) return 'image/tiff';
 // DOCX, PPTX and XLSX are all ZIP containers; the extension picks between them.
 if (starts(head, 0x50, 0x4b, 0x03, 0x04)) return ZIP_BY_EXT[ext] ?? null;

 const textType = TEXT_BY_EXT[ext];
 if (!textType || head.includes(0)) return null;
 // A multi-byte character can be cut by the end of the sample, so ignore the last few bytes.
 const sample = head.subarray(0, Math.max(0, head.length - 4)).toString('utf-8');
 return sample.includes('\uFFFD') ? null : textType;
}

async function readHead(filePath: string): Promise<Buffer> {
 const handle = await open(filePath, 'r');
 try {
  const head = Buffer.alloc(8192);
  const { bytesRead } = await handle.read(head, 0, head.length, 0);
  return head.subarray(0, bytesRead);
 } finally {
  await handle.close();
 }
}

async function sha256File(filePath: string): Promise<string> {
 const hash = createHash('sha256');
 for await (const chunk of createReadStream(filePath)) hash.update(chunk);
 return hash.digest('hex');
}

const newJob = (docId: string, requestId: string, uploadedBy: string, now: Date): RagJob => ({
 _id: newId('job'),
 docId,
 requestId,
 uploadedBy,
 status: 'queued',
 stage: null,
 counts: { text: 0, table: 0, image: 0 },
 attempts: 0,
 lockedAt: null,
 runAfter: null,
 workerId: null,
 errorId: null,
 createdAt: now,
 startedAt: null,
 finishedAt: null,
});

/**
 * The caller already uploaded these bytes to this collection. Normally that just returns
 * the existing job, but a document that failed, or that has no job at all (its job insert
 * failed earlier), would otherwise be stuck forever - those get a fresh job.
 */
async function reuse(existing: RagDocument, info: UploadInfo, requestId: string): Promise<IntakeResult> {
 const job = await docstore.latestJobForDocument(existing._id);
 if (job && job.status !== 'failed') return { ...info, docId: existing._id, jobId: job._id, status: job.status };

 const retry = newJob(existing._id, requestId, existing.uploadedBy, new Date());
 await docstore.insertJob(retry);
 await docstore.setDocumentStatus(existing._id, 'queued');
 return { ...info, docId: existing._id, jobId: retry._id, status: 'queued' };
}

async function register(
 source: { path: string } | { buffer: Buffer },
 info: UploadInfo,
 fields: IngestFields,
 principal: Principal,
 requestId: string
): Promise<IntakeResult> {
 // Uploads are idempotent per uploader: the same bytes in the same collection return the existing document.
 const existing = await docstore.findDocumentByHash(fields.collection, info.sha256, principal.id);
 if (existing) return reuse(existing, info, requestId);

 const now = new Date();
 const docId = newId('doc');
 const blobId = await saveBlob(source, info.filename, { docId });
 try {
  await docstore.insertDocument({
   _id: docId,
   collection: fields.collection,
   filename: info.filename,
   mimeType: info.mimeType,
   sha256: info.sha256,
   sizeBytes: info.sizeBytes,
   blobId,
   status: 'queued',
   chunkCount: 0,
   metadata: fields.metadata,
   // The uploader can always retrieve their own content; `acl` only adds to that.
   acl: [...new Set([`user:${principal.id}`, ...(fields.acl ?? [])])],
   uploadedBy: principal.id,
   createdAt: now,
   updatedAt: now,
  });
 } catch (err) {
  // Whatever went wrong, the blob just written has no document pointing at it.
  await deleteBlobs([blobId]);
  // Two uploads of the same file raced past the lookup above; the unique index let one through.
  if ((err as { code?: number }).code !== 11000) throw err;
  const winner = await docstore.findDocumentByHash(fields.collection, info.sha256, principal.id);
  if (!winner) throw err;
  return reuse(winner, info, requestId);
 }

 const job = newJob(docId, requestId, principal.id, now);
 try {
  await docstore.insertJob(job);
 } catch (err) {
  // Without a job no worker would ever pick the document up, so take it back out.
  await docstore.deleteDocumentRecord(docId).catch(() => undefined);
  await deleteBlobs([blobId]);
  throw err;
 }
 return { ...info, docId, jobId: job._id, status: 'queued' };
}

export const discardUpload = (filePath: string) => unlink(filePath).catch(() => undefined);

export interface UploadedFile {
 path: string;
 originalname: string;
 size: number;
}

/**
 * Checks an upload against the type allow-list. Run for every file in a request before
 * any of them is registered, so one bad file rejects the request without queuing the rest.
 */
export async function inspectFile(file: UploadedFile): Promise<{ filename: string; mimeType: string }> {
 const filename = path.basename(file.originalname);
 const mimeType = sniffType(await readHead(file.path), filename);
 if (!mimeType) {
  throw new HttpError(415, 'unsupported_file_type', `"${filename}" is not a supported file type.`);
 }
 return { filename, mimeType };
}

/** Registers one inspected multer temp file and always removes it afterwards. */
export async function registerFile(
 file: UploadedFile,
 { filename, mimeType }: { filename: string; mimeType: string },
 fields: IngestFields,
 principal: Principal,
 requestId: string
): Promise<IntakeResult> {
 try {
  const sha256 = await sha256File(file.path);
  return await register(
   { path: file.path },
   { filename, mimeType, sizeBytes: file.size, sha256 },
   fields,
   principal,
   requestId
  );
 } finally {
  await discardUpload(file.path);
 }
}

export function registerText(text: string, fields: IngestFields, principal: Principal, requestId: string) {
 const buffer = Buffer.from(text, 'utf-8');
 const markdown = fields.textFormat === 'markdown';
 const sha256 = createHash('sha256').update(buffer).digest('hex');
 return register(
  { buffer },
  {
   filename: `inline-${sha256.slice(0, 12)}.${markdown ? 'md' : 'txt'}`,
   mimeType: markdown ? MIME.markdown : MIME.text,
   sizeBytes: buffer.length,
   sha256,
  },
  fields,
  principal,
  requestId
 );
}
