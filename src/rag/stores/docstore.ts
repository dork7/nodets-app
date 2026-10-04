import type { Document } from '@langchain/core/documents';

import { config } from '@/rag/config';
import { getDb } from '@/rag/stores/mongo';
import type { Parent, RagDocument, RagJob, Source } from '@/rag/types';

const documents = () => getDb().collection<RagDocument>('rag_documents');
const parents = () => getDb().collection<Parent>('rag_parents');
const jobs = () => getDb().collection<RagJob>('rag_jobs');

// ===== Documents =====

/** Dedupe is per uploader: one user's upload must never resolve to, or be blocked by, another user's document. */
export const findDocumentByHash = (collection: string, sha256: string, uploadedBy: string) =>
 documents().findOne({ collection, sha256, uploadedBy });

export const getDocument = (docId: string) => documents().findOne({ _id: docId });

export const insertDocument = (doc: RagDocument) => documents().insertOne(doc);

export const setDocumentStatus = (docId: string, status: RagDocument['status'], chunkCount?: number) =>
 documents().updateOne(
  { _id: docId },
  { $set: { status, updatedAt: new Date(), ...(chunkCount === undefined ? {} : { chunkCount }) } }
 );

export const deleteDocumentRecord = (docId: string) => documents().deleteOne({ _id: docId });

// ===== Parents =====

export async function replaceParents(docId: string, rows: Parent[]) {
 await parents().deleteMany({ docId });
 if (rows.length) await parents().insertMany(rows);
}

export const listParentBlobIds = async (docId: string): Promise<string[]> =>
 (
  await parents()
   .find({ docId, blobId: { $ne: null } }, { projection: { blobId: 1 } })
   .toArray()
 ).map((p) => p.blobId as string);

export const deleteParents = (docId: string) => parents().deleteMany({ docId });

/**
 * Swaps each retrieved chunk for its parent, de-duplicated and numbered S1..Sn in rank order.
 * A hit whose parent is missing (document mid-reindex or deleted) is dropped.
 */
export async function loadParents(hits: Document[]): Promise<Source[]> {
 const ids = [...new Set(hits.map((d) => d.metadata.parentId as string))];
 if (!ids.length) return [];
 const found = new Map(
  (
   await parents()
    .find({ _id: { $in: ids } })
    .toArray()
  ).map((p) => [p._id, p])
 );
 const filenames = new Map(hits.map((d) => [d.metadata.parentId as string, String(d.metadata.filename ?? '')]));

 const sources: Source[] = [];
 let budget = config.maxContextChars;
 for (const id of ids) {
  const parent = found.get(id);
  if (!parent) continue;
  // Parents are whole sections and can be very large; the best-ranked ones get the budget first.
  if (budget <= 0) break;
  const content = parent.content.slice(0, budget);
  budget -= content.length;
  sources.push({
   sourceId: `S${sources.length + 1}`,
   parentId: parent._id,
   docId: parent.docId,
   filename: filenames.get(id) ?? '',
   page: parent.page,
   modality: parent.modality,
   content,
   blobId: parent.blobId,
  });
 }
 return sources;
}

// ===== Jobs =====

export const insertJob = (job: RagJob) => jobs().insertOne(job);

export const getJob = (jobId: string) => jobs().findOne({ _id: jobId });

export const latestJobForDocument = (docId: string) => jobs().findOne({ docId }, { sort: { createdAt: -1 } });

export const deleteJobs = (docId: string) => jobs().deleteMany({ docId });

export const setJobStage = (jobId: string, stage: string) => jobs().updateOne({ _id: jobId }, { $set: { stage } });

const isStale = () => ({ $lt: new Date(Date.now() - config.jobLockTimeoutMs) });

/** Atomic claim; a stale lock makes a crashed job claimable again. Requeued jobs wait out their backoff. */
export function claimNextJob(workerId: string) {
 const now = new Date();
 return jobs().findOneAndUpdate(
  {
   attempts: { $lt: config.maxJobAttempts },
   // Matches jobs with no backoff set as well as those whose backoff has passed.
   runAfter: { $not: { $gt: now } },
   $or: [{ status: 'queued' }, { status: 'running', lockedAt: isStale() }],
  },
  { $set: { status: 'running', lockedAt: now, workerId, startedAt: now }, $inc: { attempts: 1 } },
  { sort: { createdAt: 1 }, returnDocument: 'after' }
 );
}

/** Only the worker that currently holds the job may write its outcome. */
const owned = (job: Pick<RagJob, '_id' | 'workerId'>) => ({
 _id: job._id,
 workerId: job.workerId,
 status: 'running' as const,
});

/** Heartbeat: keeps a long job from looking stale. False means the lock was lost to another worker. */
export async function touchJobLock(job: Pick<RagJob, '_id' | 'workerId'>): Promise<boolean> {
 const { matchedCount } = await jobs().updateOne(owned(job), { $set: { lockedAt: new Date() } });
 return matchedCount > 0;
}

export const ownsJob = async (jobId: string, workerId: string): Promise<boolean> =>
 (await jobs().countDocuments({ _id: jobId, workerId, status: 'running' })) > 0;

/** False when the job is no longer ours (reclaimed after a lost lock, or deleted), in which case nothing is written. */
export async function markJobSucceeded(
 job: Pick<RagJob, '_id' | 'workerId'>,
 counts: RagJob['counts']
): Promise<boolean> {
 const { matchedCount } = await jobs().updateOne(owned(job), {
  $set: { status: 'succeeded', stage: null, counts, lockedAt: null, finishedAt: new Date(), errorId: null },
 });
 return matchedCount > 0;
}

export const backoffMs = (attempts: number) =>
 Math.min(config.jobBackoffBaseMs * 2 ** Math.max(0, attempts - 1), config.jobBackoffMaxMs);

/**
 * Requeues (after a backoff) while attempts remain and a retry could help, otherwise fails
 * the job. Returns the status it ended in, or null when the job is no longer ours.
 */
export async function markJobFailedOrRequeue(
 job: RagJob,
 errorId: string,
 retryable = true
): Promise<'queued' | 'failed' | null> {
 const status = retryable && job.attempts < config.maxJobAttempts ? 'queued' : 'failed';
 const { matchedCount } = await jobs().updateOne(owned(job), {
  $set: {
   status,
   errorId,
   lockedAt: null,
   ...(status === 'failed' ? { finishedAt: new Date() } : { runAfter: new Date(Date.now() + backoffMs(job.attempts)) }),
  },
 });
 return matchedCount > 0 ? status : null;
}

/**
 * A worker that died on a job's last attempt leaves it `running` with no attempts left,
 * which the claim filter never picks up. Fails one such job and returns it, or null.
 */
export function failExhaustedJob() {
 return jobs().findOneAndUpdate(
  { status: 'running', lockedAt: isStale(), attempts: { $gte: config.maxJobAttempts } },
  { $set: { status: 'failed', lockedAt: null, finishedAt: new Date() } },
  { returnDocument: 'after' }
 );
}

export const setJobError = (jobId: string, errorId: string) => jobs().updateOne({ _id: jobId }, { $set: { errorId } });
