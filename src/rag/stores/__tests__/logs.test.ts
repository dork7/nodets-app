const insertOne = vi.fn();
const getDb = vi.fn(() => ({ collection: (name: string) => ({ insertOne: (doc: unknown) => insertOne(name, doc) }) }));
vi.mock('@/rag/stores/mongo', () => ({ getDb: () => getDb() }));

import { RagError } from '@/rag/graphUtils';
import { createLogs } from '@/rag/stores/logs';

describe('rag logs', () => {
 const fallback = { error: vi.fn() };

 beforeEach(() => {
  insertOne.mockReset().mockResolvedValue({});
  fallback.error.mockReset();
 });

 it('writes one error document, unwrapping RagError to the root cause and keeping its stage', async () => {
  const cause = Object.assign(new Error('429 rate limited'), { name: 'RateLimitError', status: 429 });
  const errorId = await createLogs(fallback).error({
   source: 'ingestion',
   err: new RagError('imageAgent', cause),
   jobId: 'job_1',
   requestId: 'req_1',
  });

  expect(errorId).toMatch(/^err_/);
  expect(insertOne).toHaveBeenCalledTimes(1);
  expect(insertOne).toHaveBeenCalledWith(
   'rag_error_logs',
   expect.objectContaining({
    errorId,
    source: 'ingestion',
    stage: 'imageAgent',
    name: 'RateLimitError',
    message: '429 rate limited',
    code: 429,
    jobId: 'job_1',
    requestId: 'req_1',
    docId: null,
   })
  );
 });

 it('truncates long messages', async () => {
  await createLogs(fallback).error({ source: 'api', err: new Error('x'.repeat(20_000)) });
  expect(insertOne.mock.calls[0][1].message).toHaveLength(8000);
 });

 it('never throws when the write fails, and falls back to the logger', async () => {
  insertOne.mockRejectedValue(new Error('mongo down'));
  const logs = createLogs(fallback);
  await expect(logs.request({ requestId: 'req_1' })).resolves.toBeUndefined();
  await expect(logs.error({ source: 'api', err: new Error('boom') })).resolves.toMatch(/^err_/);
  expect(fallback.error).toHaveBeenCalledTimes(2);
 });

 it('never throws when MongoDB is not connected at all', async () => {
  getDb.mockImplementationOnce(() => {
   throw new Error('MongoDB is not connected yet');
  });
  await expect(createLogs(fallback).request({ requestId: 'req_2' })).resolves.toBeUndefined();
  expect(fallback.error).toHaveBeenCalledTimes(1);
 });
});
