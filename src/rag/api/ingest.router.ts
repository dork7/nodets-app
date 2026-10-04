import os from 'node:os';

import { Router } from 'express';
import multer from 'multer';

import { asyncHandler, ragContext, toPrincipal } from '@/rag/api/context';
import { IngestFields, UserQuery } from '@/rag/api/schemas';
import { config } from '@/rag/config';
import { HttpError } from '@/rag/graphUtils';
import * as intake from '@/rag/ingestion/intake';
import { deleteBlobs, deleteBlobsForDocument } from '@/rag/stores/blobs';
import * as docstore from '@/rag/stores/docstore';
import { deleteDocumentPoints } from '@/rag/stores/qdrant';

const MAX_FILES = 20;
const MAX_FIELDS = 8;

// Disk storage, not memory: uploads can be tens of MB and are streamed on into GridFS.
const upload = multer({
 dest: os.tmpdir(),
 limits: {
  fileSize: config.maxUploadMb * 1024 * 1024,
  files: MAX_FILES,
  // Text fields are buffered in memory before the handler runs; without these the count is unlimited.
  fields: MAX_FIELDS,
  parts: MAX_FILES + MAX_FIELDS,
  fieldSize: 1024 * 1024,
  fieldNameSize: 64,
 },
});

export function ingestRouter() {
 const router = Router();

 router.post(
  '/ingest',
  upload.array('files'),
  asyncHandler(async (req, res) => {
   const files = (req.files as Express.Multer.File[] | undefined) ?? [];
   const parsed = IngestFields.safeParse(req.body);
   const discardAll = () => Promise.all(files.map((f) => intake.discardUpload(f.path)));
   if (!parsed.success || (files.length === 0 && !parsed.data.text?.trim())) {
    // Nothing will be registered, so the temp files multer wrote must be removed here.
    await discardAll();
    if (!parsed.success) throw parsed.error;
    throw new HttpError(400, 'empty_request', 'Provide at least one file or `text`.');
   }
   const inspected = await Promise.all(files.map((f) => intake.inspectFile(f))).catch(async (err) => {
    await discardAll();
    throw err;
   });
   const { userId, text, ...rest } = parsed.data;
   const fields: intake.IngestFields = { ...rest, metadata: rest.metadata ?? {} };
   const ctx = ragContext(res);
   const principal = toPrincipal(req, res, userId);
   // Granting "*" or another user is how content gets planted in someone else's results.
   const foreign = (fields.acl ?? []).filter(
    (entry) => entry === '*' || (entry.startsWith('user:') && entry !== `user:${principal.id}`)
   );
   if (foreign.length && !config.allowSharedAcl) {
    await discardAll();
    throw new HttpError(403, 'acl_not_allowed', `Sharing with ${foreign.join(', ')} is not enabled.`);
   }

   const results = await Promise.allSettled([
    ...files.map((f, i) => intake.registerFile(f, inspected[i], fields, principal, ctx.requestId)),
    ...(text?.trim() ? [intake.registerText(text, fields, principal, ctx.requestId)] : []),
   ]);
   const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
   if (failed) throw failed.reason;
   const jobs = results.map((r) => (r as PromiseFulfilledResult<intake.IntakeResult>).value);

   // File bytes are never logged - only what identifies each upload.
   ctx.request = {
    collection: fields.collection,
    textChars: text?.length ?? 0,
    files: jobs.map(({ filename, mimeType, sizeBytes, sha256 }) => ({ filename, mimeType, sizeBytes, sha256 })),
   };
   ctx.response = { jobs: jobs.map(({ jobId, docId, filename, status }) => ({ jobId, docId, filename, status })) };
   res.status(202).json(ctx.response);
  })
 );

 router.get(
  '/ingest/:jobId',
  asyncHandler(async (req, res) => {
   const principal = toPrincipal(req, res, UserQuery.parse(req.query).userId);
   const job = await docstore.getJob(String(req.params.jobId));
   // Someone else's job is reported as missing rather than forbidden, so ids cannot be probed.
   if (!job || job.uploadedBy !== principal.id) throw new HttpError(404, 'not_found', 'Job not found.');
   res.json({
    jobId: job._id,
    docId: job.docId,
    status: job.status,
    stage: job.stage,
    counts: job.counts,
    errorId: job.errorId,
   });
  })
 );

 router.delete(
  '/documents/:docId',
  asyncHandler(async (req, res) => {
   const principal = toPrincipal(req, res, UserQuery.parse(req.query).userId);
   const doc = await docstore.getDocument(String(req.params.docId));
   if (!doc || doc.uploadedBy !== principal.id) throw new HttpError(404, 'not_found', 'Document not found.');

   // Vectors first: once they are gone the document can no longer be retrieved, whatever happens next.
   await deleteDocumentPoints(doc._id);
   // By owner tag, not by reference: this also removes images left by failed attempts.
   await deleteBlobsForDocument(doc._id);
   await deleteBlobs([doc.blobId]);
   await docstore.deleteParents(doc._id);
   await docstore.deleteJobs(doc._id);
   await docstore.deleteDocumentRecord(doc._id);

   ragContext(res).response = { deleted: true, docId: doc._id };
   res.json({ deleted: true, docId: doc._id });
  })
 );

 return router;
}
