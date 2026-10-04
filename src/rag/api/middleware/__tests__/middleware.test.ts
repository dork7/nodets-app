import { EventEmitter } from 'node:events';

import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { z } from 'zod';

import type { RagContext } from '@/rag/api/context';
import { errorHandler } from '@/rag/api/middleware/errorHandler';
import { requestLogger, sanitiseBody } from '@/rag/api/middleware/requestLogger';
import { HttpError, RagError } from '@/rag/graphUtils';
import type { Logs } from '@/rag/stores/logs';

const logs = {
 request: vi.fn<[Record<string, any>], Promise<void>>(async () => undefined),
 error: vi.fn<[Record<string, any>], Promise<string>>(async () => 'err_test'),
};

const context = (): RagContext => ({
 requestId: 'req_1',
 userId: 'u1',
 request: null,
 response: null,
 steps: [],
 usage: null,
 errorId: null,
});

const fakeRes = (rag: RagContext | undefined, headersSent = false) => {
 const res = {
  locals: { rag },
  headersSent,
  status: vi.fn(),
  json: vi.fn(),
 };
 res.status.mockReturnValue(res);
 return res;
};

/** Runs the error handler and returns what it sent. */
const handle = async (err: unknown, res = fakeRes(context())) => {
 const next = vi.fn();
 await errorHandler(logs as unknown as Logs)(err, {} as Request, res as unknown as Response, next as NextFunction);
 return { res, next, status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
};

const zodError = () => {
 const parsed = z.object({ question: z.string() }).safeParse({});
 if (parsed.success) throw new Error('expected a validation failure');
 return parsed.error;
};

beforeEach(() => {
 logs.request.mockClear();
 logs.error.mockClear();
});

describe('errorHandler classification', () => {
 it.each([
  ['MulterError LIMIT_FILE_SIZE', new MulterError('LIMIT_FILE_SIZE'), 413, 'payload_too_large'],
  ['MulterError LIMIT_FIELD_VALUE', new MulterError('LIMIT_FIELD_VALUE'), 413, 'payload_too_large'],
  ['any other MulterError', new MulterError('LIMIT_UNEXPECTED_FILE'), 400, 'invalid_upload'],
  ['a ZodError', zodError(), 400, 'invalid_request'],
  ['an HttpError', new HttpError(415, 'unsupported_file_type', 'nope'), 415, 'unsupported_file_type'],
  [
   'an HttpError wrapped by a graph node',
   new RagError('analyst', new HttpError(503, 'llm_not_configured', 'ANTHROPIC_API_KEY is not set')),
   503,
   'llm_not_configured',
  ],
  ['an unknown error', new Error('boom'), 500, 'internal_error'],
  [
   'an unknown error wrapped by a graph node',
   new RagError('retrieve', new Error('qdrant down')),
   500,
   'internal_error',
  ],
  ['a thrown non-error', 'just a string', 500, 'internal_error'],
  ['undefined', undefined, 500, 'internal_error'],
 ])('maps %s to %i %s', async (_label, err, expectedStatus, code) => {
  const { status, body, next } = await handle(err);

  expect(status).toBe(expectedStatus);
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe('req_1');
  expect(next).not.toHaveBeenCalled();
 });

 it('maps body-parser malformed JSON to 400 with a fixed message', async () => {
  const err = Object.assign(new SyntaxError('Unexpected token } in JSON at position 12'), {
   type: 'entity.parse.failed',
   status: 400,
  });
  const { status, body } = await handle(err);

  expect(status).toBe(400);
  expect(body.error).toEqual({
   code: 'invalid_request',
   message: 'Malformed JSON body',
   details: undefined,
   requestId: 'req_1',
   errorId: null,
  });
  expect(logs.error).not.toHaveBeenCalled();
 });

 it('uses the message of the wrapped HttpError, not of the wrapper', async () => {
  const { body } = await handle(new RagError('analyst', new HttpError(503, 'llm_not_configured', 'no key')));
  expect(body.error.message).toBe('no key');
 });

 it('returns the Zod issues as details', async () => {
  const err = zodError();
  const { body } = await handle(err);
  expect(body.error.message).toBe('Invalid request');
  expect(body.error.details).toEqual(err.issues);
 });

 it('never leaks the message of an unknown error', async () => {
  const { body } = await handle(new Error('connect ECONNREFUSED mongodb://admin:secret@db'));
  expect(body.error.message).toBe('Internal error');
  expect(JSON.stringify(body)).not.toContain('secret');
 });
});

describe('errorHandler logging', () => {
 it('writes no error log for a 4xx but records the code on the request context', async () => {
  const res = fakeRes(context());
  await handle(new HttpError(404, 'not_found', 'Job not found'), res);

  expect(logs.error).not.toHaveBeenCalled();
  expect(res.locals.rag).toMatchObject({ response: { error: 'not_found' }, errorId: null });
 });

 it('writes exactly one error log for a 5xx and returns its errorId', async () => {
  const err = new Error('boom');
  const res = fakeRes(context());
  const { body } = await handle(err, res);

  expect(logs.error).toHaveBeenCalledTimes(1);
  expect(logs.error).toHaveBeenCalledWith({ source: 'api', requestId: 'req_1', userId: 'u1', err });
  expect(body.error.errorId).toBe('err_test');
  expect(res.locals.rag).toMatchObject({ response: { error: 'internal_error' }, errorId: 'err_test' });
 });

 it('attributes an error tagged with a graph stage to retrieval', async () => {
  await handle(new RagError('retrieve', new Error('qdrant down')));
  expect(logs.error.mock.calls[0][0].source).toBe('retrieval');
 });

 it('does not write an error log for an expected failure such as a 503 (model not configured)', async () => {
  const { body } = await handle(new RagError('analyst', new HttpError(503, 'llm_not_configured', 'no key')));
  expect(logs.error).not.toHaveBeenCalled();
  expect(body.error).toMatchObject({ code: 'llm_not_configured', errorId: null });
 });

 it('omits the userId when the caller was never identified', async () => {
  await handle(new Error('boom'), fakeRes({ ...context(), userId: null }));
  expect(logs.error.mock.calls[0][0].userId).toBeUndefined();
 });

 it('passes errors from non-RAG routes to the next handler untouched', async () => {
  const err = new Error('other route');
  const { res, next } = await handle(err, fakeRes(undefined));

  expect(next).toHaveBeenCalledWith(err);
  expect(res.status).not.toHaveBeenCalled();
  expect(logs.error).not.toHaveBeenCalled();
 });

 it('still logs but does not write a body when the response has already started', async () => {
  const res = fakeRes(context(), true);
  await handle(new Error('stream broke'), res);

  expect(logs.error).toHaveBeenCalledTimes(1);
  expect(res.locals.rag?.errorId).toBe('err_test');
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).not.toHaveBeenCalled();
 });
});

describe('sanitiseBody', () => {
 it.each([[undefined], [null], [''], ['a string'], [42], [false]])('returns null for %j', (body) => {
  expect(sanitiseBody(body)).toBeNull();
 });

 it('keeps only allow-listed scalar fields and logs text as a length, never as content', () => {
  expect(
   sanitiseBody({
    question: 'What was revenue?',
    text: 'confidential document text',
    collection: 'finance',
    userId: 'u1',
    topK: 8,
    mode: 'answer',
    stream: false,
    filters: { docId: 'doc_1' },
    acl: ['*'],
    secret: 'token',
   })
  ).toEqual({ collection: 'finance', userId: 'u1', topK: 8, mode: 'answer', questionChars: 17, textChars: 26 });
 });

 it('keeps falsy allow-listed scalars', () => {
  expect(sanitiseBody({ text: '', topK: 0 })).toEqual({ topK: 0, textChars: 0 });
 });

 it('ignores an allow-listed key whose value is not a scalar', () => {
  expect(sanitiseBody({ userId: { $ne: '' }, collection: ['a'] })).toEqual({});
 });

 it('truncates a long allow-listed string to 8000 characters', () => {
  expect(sanitiseBody({ collection: 'x'.repeat(20_000) })?.collection).toHaveLength(8000);
 });

 it('returns null for an array body', () => {
  expect(sanitiseBody(['a', 'b'])).toBeNull();
 });

 it('returns an empty object for an empty body', () => {
  expect(sanitiseBody({})).toEqual({});
 });
});

describe('requestLogger', () => {
 const run = (reqOverrides: Record<string, unknown> = {}) => {
  const req = {
   method: 'POST',
   baseUrl: '/v1',
   path: '/retrieve',
   ip: '10.0.0.1',
   body: { question: 'q', filters: { a: 1 } },
   get: (name: string) => (name === 'user-agent' ? 'vitest' : undefined),
   ...reqOverrides,
  };
  const res = Object.assign(new EventEmitter(), {
   locals: {} as { rag?: RagContext },
   statusCode: 200,
   writableFinished: true,
   setHeader: vi.fn(),
  });
  const next = vi.fn();
  requestLogger(logs as unknown as Logs)(req as unknown as Request, res as unknown as Response, next);
  return { req, res, next };
 };

 it('creates the request context and the x-request-id header, and logs nothing until the response closes', () => {
  const { res, next } = run();

  expect(next).toHaveBeenCalledWith();
  expect(res.locals.rag).toEqual({
   requestId: expect.stringMatching(/^req_/),
   userId: null,
   request: null,
   response: null,
   steps: [],
   usage: null,
   errorId: null,
  });
  expect(res.setHeader).toHaveBeenCalledWith('x-request-id', res.locals.rag?.requestId);
  expect(logs.request).not.toHaveBeenCalled();
 });

 it('logs the sanitised body when no handler recorded a request summary', () => {
  const { res } = run();
  res.statusCode = 400;
  res.emit('close');

  expect(logs.request).toHaveBeenCalledTimes(1);
  expect(logs.request.mock.calls[0][0]).toMatchObject({
   requestId: res.locals.rag?.requestId,
   endpoint: 'POST /v1/retrieve',
   userId: null,
   ip: '10.0.0.1',
   userAgent: 'vitest',
   request: { questionChars: 1 },
   statusCode: 400,
   aborted: false,
   response: null,
   steps: [],
   usage: null,
   errorId: null,
  });
  expect(logs.request.mock.calls[0][0].createdAt).toBeInstanceOf(Date);
  expect(logs.request.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0);
 });

 it('prefers what the handler put on the context and uses the matched route pattern', () => {
  const { req, res } = run({ path: '/jobs/job_1' });
  Object.assign(req, { route: { path: '/jobs/:jobId' }, baseUrl: '', path: '/' });
  Object.assign(res.locals.rag as RagContext, {
   userId: 'u1',
   request: { jobId: 'job_1' },
   response: { status: 'running' },
   steps: [{ node: 'analyst', ms: 3 }],
   usage: { inputTokens: 10, outputTokens: 2 },
   errorId: 'err_1',
  });
  res.emit('close');

  expect(logs.request.mock.calls[0][0]).toMatchObject({
   endpoint: 'POST /v1/jobs/:jobId',
   userId: 'u1',
   request: { jobId: 'job_1' },
   response: { status: 'running' },
   steps: [{ node: 'analyst', ms: 3 }],
   usage: { inputTokens: 10, outputTokens: 2 },
   errorId: 'err_1',
  });
 });

 it('marks a connection that closed before the response finished as aborted', () => {
  const { res } = run({ ip: undefined, get: () => undefined });
  res.writableFinished = false;
  res.emit('close');

  expect(logs.request.mock.calls[0][0]).toMatchObject({ aborted: true, ip: null, userAgent: null });
 });
});
