import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import connectDB from '@/config/mongoose';
import { bootstrapRag } from '@/rag/bootstrap';
import { config } from '@/rag/config';
import { HttpError, QualityGateError } from '@/rag/graphUtils';
import { ingestionGraph } from '@/rag/ingestion/graph';
import { DocumentGoneError, LostLockError } from '@/rag/ingestion/indexer';
import { ragLogger } from '@/rag/logger';
import * as docstore from '@/rag/stores/docstore';
import { createLogs, type Logs } from '@/rag/stores/logs';
import type { RagJob } from '@/rag/types';

const IDLE_POLL_MS = 1000;
const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

const countByKind = (kinds: { modality: string }[]) => ({
 text: kinds.filter((c) => c.modality === 'text').length,
 table: kinds.filter((c) => c.modality === 'table').length,
 image: kinds.filter((c) => c.modality === 'image').length,
});

/** Nodes wrap failures in RagError; the cause is what decides how the job ends. */
const rootCause = (err: unknown) => (err instanceof Error && err.cause instanceof Error ? err.cause : err);

/**
 * Runs one claimed job to completion. Failures are logged once, here, and the job is
 * requeued or failed. Never rejects: a failure while recording the outcome is only logged,
 * and the job's lock then goes stale so it is picked up again.
 */
export async function runJob(job: RagJob, logs: Logs) {
 // Without a heartbeat a long job (a large vision PDF) would look stale and be claimed a second time.
 const heartbeat = setInterval(
  () => void docstore.touchJobLock(job).catch((err) => ragLogger.warn(err, `rag job ${job._id}: heartbeat failed`)),
  Math.max(1000, Math.floor(config.jobLockTimeoutMs / 3))
 );
 try {
  const state = await ingestionGraph.invoke({
   jobId: job._id,
   docId: job.docId,
   requestId: job.requestId,
   workerId: job.workerId,
  });
  if (state.problems.length) throw new QualityGateError(state.problems);
  // Writes are fenced on the worker id: a run that lost its lock records nothing.
  if (await docstore.markJobSucceeded(job, countByKind(state.children))) {
   await docstore.setDocumentStatus(job.docId, 'indexed', state.chunkCount);
  }
 } catch (err) {
  try {
   const root = rootCause(err);
   if (root instanceof LostLockError || root instanceof DocumentGoneError) {
    // Not a failure of the job: another worker owns it now, or its document was deleted.
    ragLogger.warn(`rag job ${job._id} abandoned: ${root.message}`);
    return;
   }
   const errorId = await logs.error({
    source: 'ingestion',
    jobId: job._id,
    docId: job.docId,
    requestId: job.requestId,
    userId: job.uploadedBy,
    err,
    context: { attempt: job.attempts },
   });
   // A rejected extraction or a missing model key fails the same way every time; do not spend retries on it.
   const retryable = !(root instanceof QualityGateError || root instanceof HttpError);
   const status = await docstore.markJobFailedOrRequeue(job, errorId, retryable);
   if (status) await docstore.setDocumentStatus(job.docId, status === 'failed' ? 'failed' : 'queued');
  } catch (bookkeepingError) {
   ragLogger.error(bookkeepingError, `rag job ${job._id}: could not record its failure`);
  }
 } finally {
  clearInterval(heartbeat);
 }
}

/** Fails jobs whose worker died on their last attempt; nothing else would ever move them out of `running`. */
export async function reapExhaustedJobs(logs: Logs) {
 for (let job = await docstore.failExhaustedJob(); job; job = await docstore.failExhaustedJob()) {
  const errorId = await logs.error({
   source: 'ingestion',
   jobId: job._id,
   docId: job.docId,
   requestId: job.requestId,
   userId: job.uploadedBy,
   err: new Error('The worker stopped during the last allowed attempt'),
   context: { attempt: job.attempts, workerId: job.workerId },
  });
  await docstore.setJobError(job._id, errorId);
  await docstore.setDocumentStatus(job.docId, 'failed');
 }
}

async function loop(logs: Logs, isStopping: () => boolean) {
 while (!isStopping()) {
  try {
   const job = await docstore.claimNextJob(workerId);
   if (job) {
    await runJob(job, logs);
    continue;
   }
   await reapExhaustedJobs(logs);
  } catch (err) {
   // A database blip must not end the loop; wait and poll again.
   ragLogger.error(err, 'rag worker loop error');
  }
  await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
 }
}

export async function startWorker() {
 await connectDB();
 const logs = createLogs(ragLogger);
 let stopping = false;

 // Indexes (unique dedupe key, log TTL) must exist before the first job; this is idempotent.
 await bootstrapRag().catch((err) => ragLogger.error(err, 'rag bootstrap failed; continuing without it'));

 process.on('unhandledRejection', (err) => void logs.error({ source: 'process', err, context: { workerId } }));
 process.on('uncaughtException', (err) => {
  // The process is in an unknown state after this; record it and let the supervisor restart us.
  void logs.error({ source: 'process', err, context: { workerId } }).finally(() => process.exit(1));
 });
 for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
   ragLogger.info(`rag worker ${workerId} stopping after the current jobs`);
   stopping = true;
  });
 }

 ragLogger.info(`rag worker ${workerId} started (concurrency ${config.workerConcurrency})`);
 await Promise.all(Array.from({ length: config.workerConcurrency }, () => loop(logs, () => stopping)));
 process.exit(0);
}

// Parsing is CPU-heavy, so ingestion runs as its own process: `npm run rag:worker`.
if (require.main === module) {
 startWorker().catch((err) => {
  ragLogger.error(err, 'rag worker failed to start');
  process.exit(1);
 });
}
