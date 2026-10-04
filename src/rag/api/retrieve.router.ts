import { Router } from 'express';

import { asyncHandler, ragContext, toPrincipal } from '@/rag/api/context';
import { RetrieveRequest } from '@/rag/api/schemas';
import { UsageCollector } from '@/rag/api/usage';
import { config } from '@/rag/config';
import { HttpError } from '@/rag/graphUtils';
import { retrievalGraph } from '@/rag/retrieval/graph';
import type { RagState } from '@/rag/retrieval/state';
import type { Source } from '@/rag/types';

const SNIPPET_CHARS = 300;

const toCitation = (s: Source) => ({
 sourceId: s.sourceId,
 docId: s.docId,
 filename: s.filename,
 page: s.page,
 modality: s.modality,
 snippet: s.content.slice(0, SNIPPET_CHARS),
});

/** Shapes the final graph state into the API response. `verified` is true only for a "supported" verdict. */
export function toRetrieveResponse(state: RagState, requestId: string) {
 if (state.mode === 'chunks') {
  return {
   answer: null,
   verified: false,
   verification: null,
   citations: (state.context ?? []).map(toCitation),
   requestId,
  };
 }
 const v = state.verification;
 const cited = new Set(state.citedIds ?? []);
 return {
  answer: state.answer,
  verified: v?.verdict === 'supported',
  verification: v
   ? { verdict: v.verdict, confidence: v.confidence, attempts: state.attempts, claims: v.claims, feedback: v.feedback }
   : { verdict: 'unsupported', confidence: 0, attempts: state.attempts, claims: [], feedback: state.feedback ?? '' },
  citations: (state.context ?? []).filter((s) => cited.has(s.sourceId)).map(toCitation),
  requestId,
 };
}

type RetrieveResponse = ReturnType<typeof toRetrieveResponse>;

/** What the request log keeps of a response: the outcome, and the answer text only when configured to. */
const summarise = (payload: RetrieveResponse) => ({
 verified: payload.verified,
 verdict: payload.verification?.verdict ?? null,
 attempts: payload.verification?.attempts ?? null,
 citedDocIds: [...new Set(payload.citations.map((c) => c.docId))],
 ...(config.logStoreAnswers ? { answer: payload.answer } : {}),
});

export function retrieveRouter() {
 const router = Router();

 router.post(
  '/retrieve',
  asyncHandler(async (req, res) => {
   const body = RetrieveRequest.parse(req.body);
   const ctx = ragContext(res);
   const principal = toPrincipal(req, res, body.userId);
   ctx.request = {
    question: body.question,
    collection: body.collection,
    filters: body.filters ?? {},
    topK: body.topK,
    mode: body.mode,
   };

   // Stop spending on model calls once the deadline passes or the client has gone away.
   const abort = new AbortController();
   const deadline = setTimeout(() => abort.abort(), config.retrieveTimeoutMs);
   res.on('close', () => {
    clearTimeout(deadline);
    if (!res.writableFinished) abort.abort();
   });
   const { signal } = abort;

   const usage = new UsageCollector();
   const state = await retrievalGraph
    .invoke(
     {
      requestId: ctx.requestId,
      question: body.question,
      collection: body.collection,
      filters: body.filters ?? {},
      inferredFilters: {},
      topK: body.topK ?? config.rerankTopK,
      mode: body.mode,
      principal,
     },
     // Each attempt runs up to five nodes; leave headroom above LangGraph's default step limit.
     { callbacks: [usage], recursionLimit: config.maxAttempts * 6 + 10, signal }
    )
    .catch((err) => {
     if (signal.aborted) throw new HttpError(504, 'retrieve_timeout', 'The request did not finish in time.');
     throw err;
    });

   const payload = toRetrieveResponse(state, ctx.requestId);
   ctx.response = summarise(payload);
   ctx.steps = state.steps;
   ctx.usage = usage.totals();
   res.json(payload);
  })
 );

 return router;
}
