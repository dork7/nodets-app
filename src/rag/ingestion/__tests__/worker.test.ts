const graphInvoke = vi.fn();
vi.mock('@/config/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/rag/ingestion/graph', () => ({ ingestionGraph: { invoke: (...args: unknown[]) => graphInvoke(...args) } }));
vi.mock('@/rag/stores/docstore', () => ({
 setDocumentStatus: vi.fn(),
 markJobSucceeded: vi.fn(),
 markJobFailedOrRequeue: vi.fn(),
 claimNextJob: vi.fn(),
 touchJobLock: vi.fn(),
 failExhaustedJob: vi.fn(),
 setJobError: vi.fn(),
}));
vi.mock('@/rag/bootstrap', () => ({ bootstrapRag: vi.fn() }));
vi.mock('@/rag/ingestion/indexer', () => {
 class DocumentGoneError extends Error {}
 class LostLockError extends Error {}
 return { DocumentGoneError, LostLockError };
});

import { HttpError, QualityGateError, RagError } from '@/rag/graphUtils';
import { DocumentGoneError, LostLockError } from '@/rag/ingestion/indexer';
import { reapExhaustedJobs, runJob } from '@/rag/ingestion/worker';
import * as docstore from '@/rag/stores/docstore';
import type { Logs } from '@/rag/stores/logs';
import type { Child, RagJob } from '@/rag/types';

const logs = {
 request: vi.fn(async () => undefined),
 error: vi.fn<[Record<string, any>], Promise<string>>(async () => 'err_test'),
};

const job: RagJob = {
 _id: 'job_1',
 docId: 'doc_1',
 requestId: 'req_1',
 uploadedBy: 'u1',
 status: 'running',
 stage: null,
 counts: { text: 0, table: 0, image: 0 },
 attempts: 1,
 lockedAt: new Date(),
 workerId: 'w1',
 errorId: null,
 createdAt: new Date(0),
 startedAt: new Date(),
 finishedAt: null,
};

const child = (modality: Child['modality']): Child => ({
 chunkId: 'chk',
 parentId: 'par',
 modality,
 content: 'x',
 page: null,
 sectionPath: [],
});

const run = () => runJob(job, logs as unknown as Logs);

beforeEach(() => {
 graphInvoke.mockReset();
 logs.error.mockClear();
 vi.mocked(docstore.setDocumentStatus).mockReset();
 vi.mocked(docstore.markJobSucceeded).mockReset().mockResolvedValue(true);
 vi.mocked(docstore.touchJobLock).mockReset().mockResolvedValue(true);
 vi.mocked(docstore.failExhaustedJob).mockReset().mockResolvedValue(null);
 vi.mocked(docstore.setJobError).mockReset();
 vi.mocked(docstore.markJobFailedOrRequeue).mockReset().mockResolvedValue('queued');
});

describe('runJob', () => {
 it('marks the document indexed and the job succeeded with per-modality counts', async () => {
  graphInvoke.mockResolvedValue({
   problems: [],
   chunkCount: 6,
   children: [child('text'), child('text'), child('text'), child('table'), child('image'), child('image')],
  });

  await run();

  expect(graphInvoke).toHaveBeenCalledWith({ jobId: 'job_1', docId: 'doc_1', requestId: 'req_1', workerId: 'w1' });
  expect(docstore.setDocumentStatus).toHaveBeenCalledTimes(1);
  expect(docstore.setDocumentStatus).toHaveBeenCalledWith('doc_1', 'indexed', 6);
  expect(docstore.markJobSucceeded).toHaveBeenCalledWith(job, { text: 3, table: 1, image: 2 });
  expect(logs.error).not.toHaveBeenCalled();
  expect(docstore.markJobFailedOrRequeue).not.toHaveBeenCalled();
 });

 it('fails the job without a requeue, with one error log, when the quality gate reports problems', async () => {
  graphInvoke.mockResolvedValue({ problems: ['the document produced nothing to index', 'x'], children: [] });
  vi.mocked(docstore.markJobFailedOrRequeue).mockResolvedValue('failed');

  await run();

  expect(logs.error).toHaveBeenCalledTimes(1);
  const logged = logs.error.mock.calls[0][0];
  expect(logged).toMatchObject({
   source: 'ingestion',
   jobId: 'job_1',
   docId: 'doc_1',
   requestId: 'req_1',
   userId: 'u1',
   context: { attempt: 1 },
  });
  expect(logged.err).toBeInstanceOf(QualityGateError);
  expect(logged.err.message).toBe('Quality gate: the document produced nothing to index; x');
  expect(docstore.markJobFailedOrRequeue).toHaveBeenCalledWith(job, 'err_test', false);
  expect(docstore.setDocumentStatus).toHaveBeenCalledTimes(1);
  expect(docstore.setDocumentStatus).toHaveBeenCalledWith('doc_1', 'failed');
  expect(docstore.markJobSucceeded).not.toHaveBeenCalled();
 });

 it('logs a thrown graph error once and requeues the job and its document', async () => {
  const err = new RagError('imageAgent', new Error('429 rate limited'));
  graphInvoke.mockRejectedValue(err);

  await expect(run()).resolves.toBeUndefined();

  expect(logs.error).toHaveBeenCalledTimes(1);
  expect(logs.error.mock.calls[0][0].err).toBe(err);
  expect(docstore.markJobFailedOrRequeue).toHaveBeenCalledWith(job, 'err_test', true);
  expect(docstore.setDocumentStatus).toHaveBeenCalledWith('doc_1', 'queued');
 });

 it('marks the document failed when a retryable error has used the last attempt', async () => {
  graphInvoke.mockRejectedValue(new Error('qdrant down'));
  vi.mocked(docstore.markJobFailedOrRequeue).mockResolvedValue('failed');

  await run();

  expect(docstore.markJobFailedOrRequeue).toHaveBeenCalledWith(job, 'err_test', true);
  expect(docstore.setDocumentStatus).toHaveBeenCalledWith('doc_1', 'failed');
 });

 it.each([
  ['wrapped in RagError by a node', new RagError('tableAgent', new HttpError(503, 'llm_not_configured', 'no key'))],
  ['thrown directly', new HttpError(503, 'llm_not_configured', 'no key')],
 ])('does not retry an HttpError (model not configured) %s', async (_label, err) => {
  graphInvoke.mockRejectedValue(err);
  vi.mocked(docstore.markJobFailedOrRequeue).mockResolvedValue('failed');

  await run();

  expect(logs.error).toHaveBeenCalledTimes(1);
  expect(docstore.markJobFailedOrRequeue).toHaveBeenCalledWith(job, 'err_test', false);
  expect(docstore.setDocumentStatus).toHaveBeenCalledWith('doc_1', 'failed');
 });

 it('treats a failure to record success as a job failure rather than leaving the job running', async () => {
  graphInvoke.mockResolvedValue({ problems: [], chunkCount: 1, children: [child('text')] });
  vi.mocked(docstore.markJobSucceeded).mockRejectedValue(new Error('mongo blip'));

  await run();

  expect(logs.error).toHaveBeenCalledTimes(1);
  expect(docstore.markJobFailedOrRequeue).toHaveBeenCalledWith(job, 'err_test', true);
  expect(docstore.setDocumentStatus).toHaveBeenLastCalledWith('doc_1', 'queued');
 });

 it('writes nothing when the lock was lost: another worker owns the job now', async () => {
  graphInvoke.mockResolvedValue({ problems: [], chunkCount: 1, children: [child('text')] });
  vi.mocked(docstore.markJobSucceeded).mockResolvedValue(false);

  await run();

  expect(docstore.setDocumentStatus).not.toHaveBeenCalled();
  expect(logs.error).not.toHaveBeenCalled();
 });

 it.each([
  ['the indexer found the lock lost', new RagError('indexer', new LostLockError('job_1'))],
  ['the document was deleted mid-ingestion', new RagError('indexer', new DocumentGoneError('doc_1'))],
 ])('abandons the job without logging or bookkeeping when %s', async (_label, err) => {
  graphInvoke.mockRejectedValue(err);

  await run();

  expect(logs.error).not.toHaveBeenCalled();
  expect(docstore.markJobFailedOrRequeue).not.toHaveBeenCalled();
  expect(docstore.setDocumentStatus).not.toHaveBeenCalled();
 });

 it('leaves the document alone when the failure could not be recorded against this worker', async () => {
  graphInvoke.mockRejectedValue(new Error('qdrant down'));
  vi.mocked(docstore.markJobFailedOrRequeue).mockResolvedValue(null);

  await run();

  expect(docstore.setDocumentStatus).not.toHaveBeenCalled();
 });

 it('never rejects, even when recording the failure itself fails', async () => {
  graphInvoke.mockRejectedValue(new Error('qdrant down'));
  vi.mocked(docstore.markJobFailedOrRequeue).mockRejectedValue(new Error('mongo blip'));

  await expect(run()).resolves.toBeUndefined();
 });

 it('refreshes the job lock while the job runs and stops afterwards', async () => {
  vi.useFakeTimers();
  let finish: (value: unknown) => void = () => undefined;
  graphInvoke.mockReturnValue(new Promise((resolve) => (finish = resolve)));

  const running = run();
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
  const beats = vi.mocked(docstore.touchJobLock).mock.calls.length;
  expect(beats).toBeGreaterThanOrEqual(2);
  expect(docstore.touchJobLock).toHaveBeenCalledWith(job);

  finish({ problems: [], chunkCount: 0, children: [] });
  await running;
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
  expect(docstore.touchJobLock).toHaveBeenCalledTimes(beats);
  vi.useRealTimers();
 });
});

describe('reapExhaustedJobs', () => {
 it('fails each stuck job with one error log and marks its document failed', async () => {
  vi
   .mocked(docstore.failExhaustedJob)
   .mockResolvedValueOnce({ ...job, attempts: 3 } as never)
   .mockResolvedValueOnce(null);

  await reapExhaustedJobs(logs as unknown as Logs);

  expect(logs.error).toHaveBeenCalledTimes(1);
  expect(logs.error.mock.calls[0][0]).toMatchObject({ source: 'ingestion', jobId: 'job_1', docId: 'doc_1' });
  expect(docstore.setJobError).toHaveBeenCalledWith('job_1', 'err_test');
  expect(docstore.setDocumentStatus).toHaveBeenCalledWith('doc_1', 'failed');
 });
});
