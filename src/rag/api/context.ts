import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { HttpError, type Step } from '@/rag/graphUtils';
import type { Principal } from '@/rag/types';

/** Per-request log context: handlers fill it in, the request logger reads it when the response closes. */
export interface RagContext {
 requestId: string;
 userId: string | null;
 request: unknown;
 response: unknown;
 steps: Step[];
 usage: { inputTokens: number; outputTokens: number } | null;
 errorId: string | null;
 /** Set when an auth middleware is mounted: identity must then come from it, never from the request body. */
 authRequired?: boolean;
}

/** Undefined for requests that did not pass through the RAG request logger. */
export const ragContext = (res: Response): RagContext => res.locals.rag;

/**
 * The caller's identity and the ACL entries it matches. An auth middleware's `req.user`
 * wins when one is mounted; otherwise the `userId` the request carries is used.
 */
export function toPrincipal(req: Request, res: Response, userId: string): Principal {
 const authenticated = (req as { user?: { id?: unknown } }).user?.id;
 // With auth mounted, a middleware that did not set req.user.id must not silently fall back to the client's claim.
 if (ragContext(res).authRequired && authenticated == null) {
  throw new HttpError(401, 'unauthorized', 'Authentication is required.');
 }
 const id = String(authenticated ?? userId);
 ragContext(res).userId = id;
 return { id, acl: [`user:${id}`, '*'] };
}

/** Express 4 does not forward rejected promises from async handlers. */
export const asyncHandler =
 (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
 (req, res, next) => {
  fn(req, res, next).catch(next);
 };
