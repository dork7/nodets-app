import type { RequestHandler } from 'express';

import { type RagContext, ragContext } from '@/rag/api/context';
import { newId } from '@/rag/graphUtils';
import { clip, type Logs } from '@/rag/stores/logs';

/** Request fields that are safe to log when a call is rejected before its handler built a summary. */
const LOGGED_FIELDS = ['collection', 'userId', 'textFormat', 'mode', 'topK'];

/**
 * Fallback request summary for calls rejected before a handler ran. Only allow-listed
 * scalar fields are kept; document text and questions are logged as lengths, never as content.
 */
export function sanitiseBody(body: unknown): Record<string, unknown> | null {
 if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
 const source = body as Record<string, unknown>;
 const summary: Record<string, unknown> = {};
 for (const key of LOGGED_FIELDS) {
  if (['string', 'number', 'boolean'].includes(typeof source[key])) summary[key] = clip(source[key]);
 }
 if (typeof source.text === 'string') summary.textChars = source.text.length;
 if (typeof source.question === 'string') summary.questionChars = source.question.length;
 return summary;
}

/** Writes one `rag_request_logs` document per request when the response closes - including 4xx and aborted ones. */
export function requestLogger(logs: Logs): RequestHandler {
 return (req, res, next) => {
  const requestId = newId('req');
  const startedAt = Date.now();
  // Captured now: Express rewrites baseUrl/path while routing, and they differ again by the time the response closes.
  const mount = req.baseUrl;
  const path = req.path;
  const ctx: RagContext = {
   requestId,
   userId: null,
   request: null,
   response: null,
   steps: [],
   usage: null,
   errorId: null,
  };
  res.locals.rag = ctx;
  res.setHeader('x-request-id', requestId);

  res.on('close', () => {
   void logs.request({
    requestId,
    createdAt: new Date(startedAt),
    endpoint: `${req.method} ${mount}${req.route?.path ?? path}`,
    userId: ragContext(res).userId,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
    request: ctx.request ?? sanitiseBody(req.body),
    statusCode: res.statusCode,
    durationMs: Date.now() - startedAt,
    aborted: !res.writableFinished,
    response: ctx.response,
    steps: ctx.steps,
    usage: ctx.usage,
    errorId: ctx.errorId,
   });
  });
  next();
 };
}
