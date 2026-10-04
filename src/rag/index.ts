import { type Express, type RequestHandler, Router } from 'express';

import { ragContext } from '@/rag/api/context';
import { ingestRouter } from '@/rag/api/ingest.router';
import { errorHandler } from '@/rag/api/middleware/errorHandler';
import { requestLogger } from '@/rag/api/middleware/requestLogger';
import { retrieveRouter } from '@/rag/api/retrieve.router';
import { ragLogger } from '@/rag/logger';
import { createLogs, type Logs } from '@/rag/stores/logs';

/** Only these paths belong to the pipeline; the logger and auth must not run for the rest of /v1. */
const RAG_PATHS = ['/ingest', '/retrieve', '/documents'];

const onRagPath =
 (middleware: RequestHandler): RequestHandler =>
 (req, res, next) =>
  RAG_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`)) ? middleware(req, res, next) : next();

export function createRagRouter(deps: { auth?: RequestHandler; logs?: Logs } = {}) {
 const logs = deps.logs ?? createLogs(ragLogger);
 const router = Router();
 // First, so rejected requests (401, 400, 413) are logged too.
 router.use(onRagPath(requestLogger(logs)));
 if (deps.auth) {
  router.use(
   onRagPath((_req, res, next) => {
    ragContext(res).authRequired = true;
    next();
   })
  );
  router.use(onRagPath(deps.auth));
 }
 router.use(ingestRouter());
 router.use(retrieveRouter());
 // Last, so it sees errors from both routers.
 router.use(errorHandler(logs));
 return router;
}

/**
 * Mounts POST /v1/ingest, GET /v1/ingest/:jobId, DELETE /v1/documents/:docId and
 * POST /v1/retrieve on the existing app. Pass the app's auth middleware once it has one.
 */
export function mountRag(app: Express, deps: { auth?: RequestHandler } = {}) {
 app.use('/v1', createRagRouter(deps));
}
