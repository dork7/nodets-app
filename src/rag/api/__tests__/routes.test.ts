import express from 'express';
import request from 'supertest';

const invoke = vi.fn();
vi.mock('@/rag/retrieval/graph', () => ({ retrievalGraph: { invoke: (...args: unknown[]) => invoke(...args) } }));
vi.mock('@/rag/ingestion/intake', () => ({
 registerFile: vi.fn(),
 registerText: vi.fn(),
 inspectFile: vi.fn(),
 discardUpload: vi.fn(),
}));
vi.mock('@/rag/stores/docstore', () => ({
 getJob: vi.fn(),
 getDocument: vi.fn(),
 listParentBlobIds: vi.fn(),
 deleteParents: vi.fn(),
 deleteJobs: vi.fn(),
 deleteDocumentRecord: vi.fn(),
}));
vi.mock('@/rag/stores/blobs', () => ({ deleteBlobs: vi.fn(), deleteBlobsForDocument: vi.fn() }));
vi.mock('@/rag/stores/qdrant', () => ({ deleteDocumentPoints: vi.fn() }));

import { createRagRouter } from '@/rag';
import { HttpError, RagError } from '@/rag/graphUtils';
import * as intake from '@/rag/ingestion/intake';
import { deleteBlobs, deleteBlobsForDocument } from '@/rag/stores/blobs';
import * as docstore from '@/rag/stores/docstore';
import { deleteDocumentPoints } from '@/rag/stores/qdrant';

const logs = {
 request: vi.fn<[Record<string, any>], Promise<void>>(async () => undefined),
 error: vi.fn<[Record<string, any>], Promise<string>>(async () => 'err_test'),
};

const app = express();
app.use(express.json());
app.use('/v1', createRagRouter({ logs }));
app.get('/v1/other', (_req, res) => res.json({ ok: true }));

/** The request log is written when the response closes, just after supertest resolves. */
const requestLog = async () => {
 await vi.waitFor(() => expect(logs.request).toHaveBeenCalled());
 return logs.request.mock.calls[0][0];
};

const supportedState = {
 mode: 'answer',
 answer: 'Revenue was 412M [S1].',
 citedIds: ['S1'],
 attempts: 1,
 steps: [{ node: 'analyst', ms: 5 }],
 context: [
  {
   sourceId: 'S1',
   parentId: 'par_1',
   docId: 'doc_1',
   filename: 'r.pdf',
   page: 14,
   modality: 'table',
   content: '| 2025 | 412 |',
   blobId: null,
  },
  {
   sourceId: 'S2',
   parentId: 'par_2',
   docId: 'doc_2',
   filename: 'x.pdf',
   page: 1,
   modality: 'text',
   content: 'unused',
   blobId: null,
  },
 ],
 verification: {
  verdict: 'supported',
  confidence: 0.94,
  feedback: '',
  claims: [{ claim: 'Revenue was 412M', supported: true, sourceId: 'S1', evidence: '| 2025 | 412 |' }],
 },
};

beforeEach(() => {
 invoke.mockReset();
 logs.request.mockClear();
 logs.error.mockClear();
});

describe('POST /v1/retrieve', () => {
 const body = { question: 'What was revenue?', collection: 'finance', userId: 'u1' };

 it('returns the verified answer with citations for cited sources only, and logs the request once', async () => {
  invoke.mockResolvedValue(supportedState);
  const res = await request(app).post('/v1/retrieve').send(body);

  expect(res.status).toBe(200);
  expect(res.headers['x-request-id']).toMatch(/^req_/);
  expect(res.body).toMatchObject({
   answer: 'Revenue was 412M [S1].',
   verified: true,
   requestId: res.headers['x-request-id'],
  });
  expect(res.body.verification).toMatchObject({ verdict: 'supported', attempts: 1 });
  expect(res.body.citations).toEqual([
   { sourceId: 'S1', docId: 'doc_1', filename: 'r.pdf', page: 14, modality: 'table', snippet: '| 2025 | 412 |' },
  ]);
  expect(invoke.mock.calls[0][0]).toMatchObject({
   principal: { id: 'u1', acl: ['user:u1', '*'] },
   topK: 8,
   mode: 'answer',
  });

  const log = await requestLog();
  expect(logs.request).toHaveBeenCalledTimes(1);
  expect(log).toMatchObject({
   requestId: res.headers['x-request-id'],
   endpoint: 'POST /v1/retrieve',
   userId: 'u1',
   statusCode: 200,
   aborted: false,
   errorId: null,
   steps: [{ node: 'analyst', ms: 5 }],
   response: { verified: true, verdict: 'supported', attempts: 1, citedDocIds: ['doc_1'] },
  });
  expect(logs.error).not.toHaveBeenCalled();
 });

 it('returns 200 with verified:false when the graph abstained', async () => {
  invoke.mockResolvedValue({
   ...supportedState,
   answer: 'not found',
   citedIds: [],
   attempts: 3,
   verification: null,
   feedback: 'nothing',
  });
  const res = await request(app).post('/v1/retrieve').send(body);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
   verified: false,
   citations: [],
   verification: { verdict: 'unsupported', attempts: 3 },
  });
 });

 it('rejects an invalid body with 400, logged in the request log but not as an error', async () => {
  const res = await request(app).post('/v1/retrieve').send({ question: 'q' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatchObject({
   code: 'invalid_request',
   errorId: null,
   requestId: res.headers['x-request-id'],
  });
  expect(invoke).not.toHaveBeenCalled();

  const log = await requestLog();
  expect(log).toMatchObject({ statusCode: 400, response: { error: 'invalid_request' }, request: { questionChars: 1 } });
  expect(logs.error).not.toHaveBeenCalled();
 });

 it('turns a graph failure into a 500 with exactly one error log linked by requestId', async () => {
  invoke.mockRejectedValue(new RagError('verifier', new Error('model exploded')));
  const res = await request(app).post('/v1/retrieve').send(body);

  expect(res.status).toBe(500);
  expect(res.body.error).toEqual({
   code: 'internal_error',
   message: 'Internal error',
   requestId: res.headers['x-request-id'],
   errorId: 'err_test',
  });
  expect(logs.error).toHaveBeenCalledTimes(1);
  expect(logs.error.mock.calls[0][0]).toMatchObject({
   source: 'retrieval',
   requestId: res.headers['x-request-id'],
   userId: 'u1',
  });
  expect((await requestLog()).errorId).toBe('err_test');
 });
});

describe('POST /v1/ingest', () => {
 it('rejects a request with neither files nor text', async () => {
  const res = await request(app).post('/v1/ingest').field('collection', 'finance').field('userId', 'u1');
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('empty_request');
 });

 it('queues inline text and uploaded files, logging file identity but never bytes', async () => {
  const job = {
   jobId: 'job_1',
   docId: 'doc_1',
   filename: 'a.md',
   status: 'queued',
   mimeType: 'text/markdown',
   sizeBytes: 7,
   sha256: 'abc',
  };
  vi.mocked(intake.inspectFile).mockResolvedValue({ filename: 'a.md', mimeType: 'text/markdown' });
  vi.mocked(intake.registerFile).mockResolvedValue(job);
  vi.mocked(intake.registerText).mockResolvedValue({ ...job, jobId: 'job_2', docId: 'doc_2', filename: 'inline.txt' });

  const res = await request(app)
   .post('/v1/ingest')
   .field('collection', 'finance')
   .field('userId', 'u1')
   .field('text', 'hello')
   .field('metadata', '{"team":"fin"}')
   .field('acl', '["group:finance"]')
   .attach('files', Buffer.from('# Title'), 'a.md');

  expect(res.status).toBe(202);
  expect(res.body.jobs).toEqual([
   { jobId: 'job_1', docId: 'doc_1', filename: 'a.md', status: 'queued' },
   { jobId: 'job_2', docId: 'doc_2', filename: 'inline.txt', status: 'queued' },
  ]);
  const fields = vi.mocked(intake.registerFile).mock.calls[0][2];
  expect(fields).toMatchObject({
   collection: 'finance',
   metadata: { team: 'fin' },
   acl: ['group:finance'],
   textFormat: 'plain',
  });

  const log = await requestLog();
  expect(log.request.files[0]).toEqual({ filename: 'a.md', mimeType: 'text/markdown', sizeBytes: 7, sha256: 'abc' });
  expect(JSON.stringify(log)).not.toContain('# Title');
 });

 it('rejects malformed JSON fields with 400', async () => {
  const res = await request(app)
   .post('/v1/ingest')
   .field('collection', 'c')
   .field('userId', 'u1')
   .field('text', 'x')
   .field('acl', 'nope');
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('invalid_request');
 });
});

describe('POST /v1/ingest limits and sharing', () => {
 const ingest = () => request(app).post('/v1/ingest').field('collection', 'c').field('userId', 'u1').field('text', 'x');

 it.each([['["*"]'], ['["user:someone-else"]']])(
  'refuses to share content with %s while sharing is not enabled',
  async (acl) => {
   vi.mocked(intake.registerText).mockClear();
   const res = await ingest().field('acl', acl);
   expect(res.status).toBe(403);
   expect(res.body.error.code).toBe('acl_not_allowed');
   expect(intake.registerText).not.toHaveBeenCalled();
  }
 );

 it('accepts the caller own entry and group entries', async () => {
  vi.mocked(intake.registerText).mockResolvedValue({
   jobId: 'j',
   docId: 'd',
   filename: 'f',
   status: 'queued',
   mimeType: 'text/plain',
   sizeBytes: 1,
   sha256: 'h',
  });
  expect((await ingest().field('acl', '["user:u1","group:finance"]')).status).toBe(202);
 });

 it.each([
  ['an acl entry that is not a principal', 'acl', '["finance team"]'],
  ['nested metadata values', 'metadata', '{"a":{"b":1}}'],
  ['an oversized metadata value', 'metadata', JSON.stringify({ a: 'x'.repeat(501) })],
 ])('rejects %s with 400', async (_label, field, value) => {
  expect((await ingest().field(field, value)).status).toBe(400);
 });

 it('rejects a request with more text fields than the route defines', async () => {
  let req = ingest();
  for (let i = 0; i < 10; i++) req = req.field(`extra${i}`, 'x');
  const res = await req;
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('invalid_upload');
 });
});

describe('POST /v1/retrieve deadline', () => {
 it('returns 504 and aborts the graph when the request outlives its deadline', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  invoke.mockImplementation(
   (_input, options: { signal: AbortSignal }) =>
    new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))
  );

  const pending = request(app)
   .post('/v1/retrieve')
   .send({ question: 'q', collection: 'c', userId: 'u1' })
   .then((res) => res);
  await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(120_000);
  const res = await pending;
  vi.useRealTimers();

  expect(res.status).toBe(504);
  expect(res.body.error.code).toBe('retrieve_timeout');
  expect(logs.error).not.toHaveBeenCalled();
 });
});

describe('POST /v1/ingest type check', () => {
 it('rejects the whole request, registering nothing, when one file is not an allowed type', async () => {
  vi.mocked(intake.registerFile).mockClear();
  vi.mocked(intake.discardUpload).mockClear();
  vi
   .mocked(intake.inspectFile)
   .mockResolvedValueOnce({ filename: 'a.md', mimeType: 'text/markdown' })
   .mockRejectedValueOnce(new HttpError(415, 'unsupported_file_type', '"b.exe" is not a supported file type.'));

  const res = await request(app)
   .post('/v1/ingest')
   .field('collection', 'finance')
   .field('userId', 'u1')
   .attach('files', Buffer.from('# ok'), 'a.md')
   .attach('files', Buffer.from('MZ'), 'b.exe');

  expect(res.status).toBe(415);
  expect(res.body.error.code).toBe('unsupported_file_type');
  expect(intake.registerFile).not.toHaveBeenCalled();
  expect(intake.discardUpload).toHaveBeenCalledTimes(2);
 });
});

describe('job status and document delete', () => {
 const job = {
  _id: 'job_1',
  docId: 'doc_1',
  uploadedBy: 'u1',
  status: 'failed',
  stage: 'imageAgent',
  counts: { text: 1, table: 0, image: 0 },
  errorId: 'err_9',
 };

 it('returns the status of the caller’s own job', async () => {
  vi.mocked(docstore.getJob).mockResolvedValue(job as never);
  const res = await request(app).get('/v1/ingest/job_1').query({ userId: 'u1' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
   jobId: 'job_1',
   docId: 'doc_1',
   status: 'failed',
   stage: 'imageAgent',
   counts: job.counts,
   errorId: 'err_9',
  });
 });

 it('reports another user’s job as not found', async () => {
  vi.mocked(docstore.getJob).mockResolvedValue(job as never);
  expect((await request(app).get('/v1/ingest/job_1').query({ userId: 'someone-else' })).status).toBe(404);
 });

 it('deletes vectors, blobs, parents, jobs and the registry entry for the owner only', async () => {
  vi.mocked(docstore.getDocument).mockResolvedValue({ _id: 'doc_1', uploadedBy: 'u1', blobId: 'b0' } as never);
  vi.mocked(docstore.listParentBlobIds).mockResolvedValue(['b1']);

  expect((await request(app).delete('/v1/documents/doc_1').query({ userId: 'intruder' })).status).toBe(404);
  expect(deleteDocumentPoints).not.toHaveBeenCalled();

  const res = await request(app).delete('/v1/documents/doc_1').query({ userId: 'u1' });
  expect(res.body).toEqual({ deleted: true, docId: 'doc_1' });
  expect(deleteDocumentPoints).toHaveBeenCalledWith('doc_1');
  // Blobs are removed by owner tag (catching images from failed attempts), then the original upload.
  expect(deleteBlobsForDocument).toHaveBeenCalledWith('doc_1');
  expect(deleteBlobs).toHaveBeenCalledWith(['b0']);
  expect(docstore.deleteDocumentRecord).toHaveBeenCalledWith('doc_1');
 });
});

describe('scoping', () => {
 it('does not log or handle requests for other /v1 routes', async () => {
  const res = await request(app).get('/v1/other');
  expect(res.body).toEqual({ ok: true });
  expect(res.headers['x-request-id']).toBeUndefined();
  expect(logs.request).not.toHaveBeenCalled();
 });
});
