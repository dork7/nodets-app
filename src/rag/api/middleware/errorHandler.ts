import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

import { ragContext } from '@/rag/api/context';
import { HttpError, RagError } from '@/rag/graphUtils';
import type { Logs } from '@/rag/stores/logs';

const MULTER_TOO_LARGE = new Set(['LIMIT_FILE_SIZE', 'LIMIT_FIELD_VALUE']);

/** Status and machine code for an error; anything unrecognised is a 500. */
function classify(err: any): { status: number; code: string; message: string } {
 // A node may wrap an expected failure (e.g. the model is not configured) in RagError.
 const root = err instanceof RagError && err.cause instanceof HttpError ? err.cause : err;
 if (root instanceof HttpError) return { status: root.statusCode, code: root.code, message: root.message };
 if (root instanceof ZodError) return { status: 400, code: 'invalid_request', message: 'Invalid request' };
 if (root instanceof MulterError) {
  return MULTER_TOO_LARGE.has(root.code)
   ? { status: 413, code: 'payload_too_large', message: root.message }
   : { status: 400, code: 'invalid_upload', message: root.message };
 }
 // body-parser's malformed-JSON error
 if (root?.type === 'entity.parse.failed')
  return { status: 400, code: 'invalid_request', message: 'Malformed JSON body' };
 return { status: 500, code: 'internal_error', message: 'Internal error' };
}

/** One error, one log document: 5xx goes to `rag_error_logs`; 4xx is only visible through the request log. */
export function errorHandler(logs: Logs): ErrorRequestHandler {
 return async (err, req, res, next) => {
  const ctx = ragContext(res);
  // No context means the error came from another /v1 route; leave it to the app's own handler.
  if (!ctx) return next(err);
  const { status, code, message } = classify(err);

  // An HttpError is an expected outcome (e.g. 503 while the model key is unset), not a fault to investigate.
  if (status >= 500 && code === 'internal_error') {
   ctx.errorId = await logs.error({
    source: err?.stage ? 'retrieval' : 'api',
    requestId: ctx.requestId,
    userId: ctx.userId ?? undefined,
    err,
   });
  }
  ctx.response = { error: code };
  if (res.headersSent) return;
  res.status(status).json({
   error: {
    code,
    message,
    details: err instanceof ZodError ? err.issues : undefined,
    requestId: ctx.requestId,
    errorId: ctx.errorId,
   },
  });
 };
}
