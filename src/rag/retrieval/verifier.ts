import { HumanMessage, type MessageContent, SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';

import { RAG_VERIFIER_PROMPT } from '@/config/prompt';
import { toDataUrl } from '@/rag/dataUrl';
import { invokeStructured } from '@/rag/llm';
import { renderSources } from '@/rag/retrieval/sources';
import type { RagState } from '@/rag/retrieval/state';
import { readBlob } from '@/rag/stores/blobs';
import type { Source } from '@/rag/types';

const ClaimCheck = z.object({
 claim: z.string(),
 supported: z.boolean(),
 sourceId: z.string().nullable().describe('Source that supports it, e.g. S2'),
 evidence: z.string().nullable().describe('Exact quote copied from that source'),
});

export const VerificationSchema = z.object({
 claims: z.array(ClaimCheck),
 answersQuestion: z.boolean(),
 verdict: z.enum(['supported', 'partially_supported', 'unsupported']),
 failureType: z.enum(['none', 'unsupported_claims', 'insufficient_context', 'off_topic']),
 feedback: z.string().describe('What the answer agent must fix, or what to search for'),
 confidence: z.number().describe('Between 0 and 1'),
});
export type Verification = z.infer<typeof VerificationSchema>;

/** Case, whitespace and Markdown punctuation are ignored when looking a quote up in its source. */
const norm = (s: string) => s.toLowerCase().replace(/[\s|*_`#>-]+/g, '');

/** Evidence shorter than this after normalising (e.g. "---" or "|") matches every source and proves nothing. */
const MIN_EVIDENCE_CHARS = 3;

export function fail(feedback: string): Verification {
 return {
  claims: [],
  answersQuestion: false,
  verdict: 'unsupported',
  failureType: 'unsupported_claims',
  feedback,
  confidence: 1,
 };
}

/**
 * Checks the verifier's own evidence, then derives the verdict from the claims. The
 * model's `verdict` field is advisory: a claim whose quote is not in its source is unsupported.
 */
export function finalise(v: Verification, sources: Source[]): Verification {
 const byId = new Map(sources.map((s) => [s.sourceId, s]));
 const claims = v.claims.map((c) => {
  if (!c.supported) return c;
  const src = c.sourceId ? byId.get(c.sourceId) : undefined;
  // An image that was re-read from the original cannot be string-matched; an image
  // known only by its stored description (no blob) can and must be.
  const evidence = c.evidence ? norm(c.evidence) : '';
  const quoteFound =
   !!src &&
   ((src.modality === 'image' && !!src.blobId) ||
    (evidence.length >= MIN_EVIDENCE_CHARS && norm(src.content).includes(evidence)));
  return quoteFound ? c : { ...c, supported: false };
 });
 const all = claims.length > 0 && claims.every((c) => c.supported);
 const verdict =
  all && v.answersQuestion ? 'supported' : claims.some((c) => c.supported) ? 'partially_supported' : 'unsupported';
 const unsupportedCount = claims.filter((c) => !c.supported).length;
 // Every claim holds but the answer misses the question: redrafting from the same sources cannot
 // help, so this must route back to retrieval rather than to the answer agent.
 const fallbackFailure = unsupportedCount === 0 && claims.length > 0 ? 'off_topic' : 'unsupported_claims';
 const failureType = verdict === 'supported' ? 'none' : v.failureType === 'none' ? fallbackFailure : v.failureType;
 const unsupported = claims.filter((c) => !c.supported).map((c) => c.claim);
 const feedback =
  verdict !== 'supported' && unsupported.length
   ? `${v.feedback} Unsupported: ${unsupported.join(' | ')}`.trim()
   : v.feedback;
 return { ...v, claims, verdict, failureType, feedback };
}

/**
 * Raw sources, then the original images, then question and answer. The verifier sees
 * neither the answer agent's prompt nor the analyst's rewrites, and it re-reads images
 * from GridFS so a wrong ingestion-time description cannot launder a wrong answer.
 */
async function buildVerifierContent(state: RagState): Promise<MessageContent> {
 const content: Exclude<MessageContent, string> = [{ type: 'text', text: `SOURCES:\n${renderSources(state.context)}` }];
 for (const source of state.context) {
  if (source.modality !== 'image' || !source.blobId) continue;
  content.push({ type: 'text', text: `Original image for ${source.sourceId}:` });
  content.push({ type: 'image_url', image_url: { url: toDataUrl(await readBlob(source.blobId)) } });
 }
 content.push({ type: 'text', text: `QUESTION: ${state.question}\n\nANSWER:\n${state.answer}` });
 return content;
}

export async function verifyNode(state: RagState, config?: RunnableConfig) {
 // Citation integrity is checked in code before any model call.
 const known = new Set(state.context.map((s) => s.sourceId));
 let verification: Verification;
 const bad = state.citedIds.filter((id) => !known.has(id));
 if (state.citedIds.length === 0) verification = fail('The answer cites no sources.');
 else if (bad.length) verification = fail(`Citations ${bad.join(', ')} do not exist.`);
 else {
  const raw = await invokeStructured(
   'verifier',
   VerificationSchema,
   [new SystemMessage(RAG_VERIFIER_PROMPT), new HumanMessage({ content: await buildVerifierContent(state) })],
   config
  );
  verification = finalise(raw, state.context);
 }
 return { verification, feedback: verification.feedback };
}
