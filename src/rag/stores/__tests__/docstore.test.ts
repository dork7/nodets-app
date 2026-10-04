const col = {
 find: vi.fn(),
 findOneAndUpdate: vi.fn(),
 updateOne: vi.fn(),
 deleteMany: vi.fn(),
 insertMany: vi.fn(),
};
const collection = vi.fn<[string], typeof col>(() => col);
vi.mock('@/rag/stores/mongo', () => ({ getDb: () => ({ collection: (name: string) => collection(name) }) }));
vi.mock('@/rag/config', () => ({
 config: {
  maxJobAttempts: 3,
  jobLockTimeoutMs: 60_000,
  jobBackoffBaseMs: 30_000,
  jobBackoffMaxMs: 600_000,
  maxContextChars: 400_000,
 },
}));

import {
 backoffMs,
 claimNextJob,
 failExhaustedJob,
 listParentBlobIds,
 loadParents,
 markJobFailedOrRequeue,
 markJobSucceeded,
 replaceParents,
 setDocumentStatus,
 touchJobLock,
} from '@/rag/stores/docstore';
import type { Parent, RagJob } from '@/rag/types';

const parent = (id: string, extra: Partial<Parent> = {}): Parent => ({
 _id: id,
 docId: 'doc_1',
 modality: 'text',
 content: `content of ${id}`,
 blobId: null,
 page: 1,
 sectionPath: [],
 createdAt: new Date(0),
 ...extra,
});

const hit = (parentId: string, filename: string | null = 'report.pdf') => ({
 pageContent: 'chunk',
 metadata: filename === null ? { parentId } : { parentId, filename },
});

const job = (attempts: number): RagJob => ({
 _id: 'job_1',
 docId: 'doc_1',
 requestId: 'req_1',
 uploadedBy: 'u1',
 status: 'running',
 stage: 'parse',
 counts: { text: 0, table: 0, image: 0 },
 attempts,
 lockedAt: new Date(),
 workerId: 'w1',
 errorId: null,
 createdAt: new Date(0),
 startedAt: new Date(),
 finishedAt: null,
});

/** Outcome writes are fenced: only the worker still holding the running job may record its result. */
const owned = { _id: 'job_1', workerId: 'w1', status: 'running' };

const stored = (rows: Parent[]) => col.find.mockReturnValue({ toArray: async () => rows });

beforeEach(() => {
 for (const fn of Object.values(col)) fn.mockReset();
 collection.mockClear();
 col.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
});

afterEach(() => {
 vi.useRealTimers();
});

describe('loadParents', () => {
 it('returns nothing, without a query, when there are no hits', async () => {
  expect(await loadParents([])).toEqual([]);
  expect(col.find).not.toHaveBeenCalled();
 });

 it('numbers parents S1..Sn in the rank order of the hits, not the order MongoDB returns them', async () => {
  stored([parent('par_c'), parent('par_a'), parent('par_b')]);
  const sources = await loadParents([hit('par_a'), hit('par_b'), hit('par_c')]);

  expect(collection).toHaveBeenCalledWith('rag_parents');
  expect(col.find).toHaveBeenCalledWith({ _id: { $in: ['par_a', 'par_b', 'par_c'] } });
  expect(sources.map((s) => [s.sourceId, s.parentId])).toEqual([
   ['S1', 'par_a'],
   ['S2', 'par_b'],
   ['S3', 'par_c'],
  ]);
 });

 it('returns one source per parent when several chunks share it, ranked by the first hit', async () => {
  stored([parent('par_a'), parent('par_b')]);
  const sources = await loadParents([hit('par_b'), hit('par_a'), hit('par_b'), hit('par_a')]);

  expect(col.find).toHaveBeenCalledWith({ _id: { $in: ['par_b', 'par_a'] } });
  expect(sources.map((s) => [s.sourceId, s.parentId])).toEqual([
   ['S1', 'par_b'],
   ['S2', 'par_a'],
  ]);
 });

 it('drops hits whose parent is missing and keeps the numbering contiguous', async () => {
  stored([parent('par_a'), parent('par_c')]);
  const sources = await loadParents([hit('par_a'), hit('par_gone'), hit('par_c')]);

  expect(sources.map((s) => [s.sourceId, s.parentId])).toEqual([
   ['S1', 'par_a'],
   ['S2', 'par_c'],
  ]);
 });

 it('takes the filename from the hit and everything else from the parent', async () => {
  stored([
   parent('par_a', { docId: 'doc_a', modality: 'image', page: 7, blobId: 'blob_1', content: 'a chart' }),
   parent('par_b', { docId: 'doc_b', page: null }),
  ]);
  const sources = await loadParents([hit('par_a', 'a.pdf'), hit('par_b', null)]);

  expect(sources).toEqual([
   {
    sourceId: 'S1',
    parentId: 'par_a',
    docId: 'doc_a',
    filename: 'a.pdf',
    page: 7,
    modality: 'image',
    content: 'a chart',
    blobId: 'blob_1',
   },
   {
    sourceId: 'S2',
    parentId: 'par_b',
    docId: 'doc_b',
    filename: '',
    page: null,
    modality: 'text',
    content: 'content of par_b',
    blobId: null,
   },
  ]);
 });
});

describe('markJobFailedOrRequeue', () => {
 it('requeues while attempts remain, releasing the lock and leaving the job unfinished', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  expect(await markJobFailedOrRequeue(job(1), 'err_1')).toBe('queued');
  expect(await markJobFailedOrRequeue(job(2), 'err_2')).toBe('queued');

  expect(collection).toHaveBeenCalledWith('rag_jobs');
  expect(col.updateOne).toHaveBeenNthCalledWith(1, owned, {
   $set: { status: 'queued', errorId: 'err_1', lockedAt: null, runAfter: new Date('2026-01-01T00:00:30Z') },
  });
  // The delay doubles with each attempt.
  expect(col.updateOne.mock.calls[1][1].$set.runAfter).toEqual(new Date('2026-01-01T00:01:00Z'));
 });

 it('fails the job once the attempt limit is reached', async () => {
  expect(await markJobFailedOrRequeue(job(3), 'err_3')).toBe('failed');
  expect(col.updateOne).toHaveBeenCalledWith(owned, {
   $set: { status: 'failed', errorId: 'err_3', lockedAt: null, finishedAt: expect.any(Date) },
  });
 });

 it('fails immediately when the error is not retryable, even on the first attempt', async () => {
  expect(await markJobFailedOrRequeue(job(1), 'err_1', false)).toBe('failed');
  expect(col.updateOne.mock.calls[0][1].$set).toMatchObject({ status: 'failed', finishedAt: expect.any(Date) });
 });
});

describe('job ownership', () => {
 it('reports a lost lock instead of writing when another worker holds the job', async () => {
  col.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

  expect(await markJobSucceeded(job(1), { text: 1, table: 0, image: 0 })).toBe(false);
  expect(await markJobFailedOrRequeue(job(1), 'err_1')).toBeNull();
  expect(await touchJobLock(job(1))).toBe(false);
 });

 it('refreshes the lock only for the owning worker', async () => {
  expect(await touchJobLock(job(1))).toBe(true);
  expect(col.updateOne).toHaveBeenCalledWith(owned, { $set: { lockedAt: expect.any(Date) } });
 });

 it('caps the retry backoff', () => {
  expect([1, 2, 3, 10].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 600_000]);
 });

 it('fails a stale running job that has no attempts left', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
  col.findOneAndUpdate.mockResolvedValue(job(3));

  expect(await failExhaustedJob()).toMatchObject({ _id: 'job_1' });
  const [filter, update] = col.findOneAndUpdate.mock.calls[0];
  expect(filter).toEqual({
   status: 'running',
   lockedAt: { $lt: new Date('2026-01-01T00:09:00Z') },
   attempts: { $gte: 3 },
  });
  expect(update.$set).toMatchObject({ status: 'failed', lockedAt: null });
 });
});

describe('loadParents context budget', () => {
 it('gives the best-ranked sources the budget first and stops when it is spent', async () => {
  stored([
   parent('par_a', { content: 'a'.repeat(300_000) }),
   parent('par_b', { content: 'b'.repeat(300_000) }),
   parent('par_c'),
  ]);
  const sources = await loadParents([hit('par_a'), hit('par_b'), hit('par_c')]);

  expect(sources.map((s) => [s.sourceId, s.content.length])).toEqual([
   ['S1', 300_000],
   ['S2', 100_000],
  ]);
 });
});

describe('claimNextJob', () => {
 it('claims the oldest queued or stale-locked job atomically and counts the attempt', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
  const claimed = job(1);
  col.findOneAndUpdate.mockResolvedValue(claimed);

  expect(await claimNextJob('host:1:abcd')).toBe(claimed);

  expect(collection).toHaveBeenCalledWith('rag_jobs');
  expect(col.findOneAndUpdate).toHaveBeenCalledTimes(1);
  const [filter, update, options] = col.findOneAndUpdate.mock.calls[0];
  expect(filter).toEqual({
   attempts: { $lt: 3 },
   runAfter: { $not: { $gt: new Date('2026-01-01T00:10:00Z') } },
   $or: [{ status: 'queued' }, { status: 'running', lockedAt: { $lt: new Date('2026-01-01T00:09:00Z') } }],
  });
  const now = new Date('2026-01-01T00:10:00Z');
  expect(update).toEqual({
   $set: { status: 'running', lockedAt: now, workerId: 'host:1:abcd', startedAt: now },
   $inc: { attempts: 1 },
  });
  expect(options).toEqual({ sort: { createdAt: 1 }, returnDocument: 'after' });
 });

 it('returns null when nothing is claimable', async () => {
  col.findOneAndUpdate.mockResolvedValue(null);
  expect(await claimNextJob('w')).toBeNull();
 });
});

describe('document and parent writes', () => {
 it('sets chunkCount only when one is given', async () => {
  await setDocumentStatus('doc_1', 'indexing');
  await setDocumentStatus('doc_1', 'indexed', 0);

  expect(collection).toHaveBeenCalledWith('rag_documents');
  expect(col.updateOne.mock.calls[0][1].$set).toEqual({ status: 'indexing', updatedAt: expect.any(Date) });
  expect(col.updateOne.mock.calls[1][1].$set).toEqual({
   status: 'indexed',
   updatedAt: expect.any(Date),
   chunkCount: 0,
  });
 });

 it('replaces parents by deleting first, and skips the insert when there are none', async () => {
  const order: string[] = [];
  col.deleteMany.mockImplementation(async () => order.push('delete'));
  col.insertMany.mockImplementation(async () => order.push('insert'));

  await replaceParents('doc_1', []);
  expect(col.deleteMany).toHaveBeenCalledWith({ docId: 'doc_1' });
  expect(col.insertMany).not.toHaveBeenCalled();

  const rows = [parent('par_a'), parent('par_b')];
  await replaceParents('doc_1', rows);
  expect(col.insertMany).toHaveBeenCalledWith(rows);
  expect(order).toEqual(['delete', 'delete', 'insert']);
 });

 it('lists only the blob ids of parents that have one', async () => {
  stored([parent('par_a', { blobId: 'blob_1' }), parent('par_b', { blobId: 'blob_2' })]);
  expect(await listParentBlobIds('doc_1')).toEqual(['blob_1', 'blob_2']);
  expect(col.find).toHaveBeenCalledWith({ docId: 'doc_1', blobId: { $ne: null } }, { projection: { blobId: 1 } });
 });

 it('clears the lock, stage and error when a job succeeds', async () => {
  expect(await markJobSucceeded(job(1), { text: 3, table: 1, image: 0 })).toBe(true);
  expect(col.updateOne).toHaveBeenCalledWith(owned, {
   $set: {
    status: 'succeeded',
    stage: null,
    counts: { text: 3, table: 1, image: 0 },
    lockedAt: null,
    finishedAt: expect.any(Date),
    errorId: null,
   },
  });
 });
});
