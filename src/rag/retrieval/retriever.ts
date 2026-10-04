import type { Document } from '@langchain/core/documents';

import { config } from '@/rag/config';
import { queryEmbeddings } from '@/rag/embeddings';
import { ragLogger } from '@/rag/logger';
import type { RagState } from '@/rag/retrieval/state';
import * as docstore from '@/rag/stores/docstore';
import { vectorStore } from '@/rag/stores/qdrant';

/** Client-supplied filter keys are allow-listed; anything else is ignored. */
const ALLOWED_FILTERS = new Set(['docId', 'filename', 'modality', 'page']);

export function buildFilter(state: Pick<RagState, 'collection' | 'principal' | 'filters' | 'inferredFilters'>) {
 const must: object[] = [
  { key: 'metadata.collection', match: { value: state.collection } },
  // Access control is part of the Qdrant query itself, never applied afterwards in JavaScript.
  { key: 'metadata.acl', match: { any: state.principal.acl } },
 ];
 for (const [key, value] of Object.entries({ ...state.inferredFilters, ...state.filters })) {
  const scalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  if (ALLOWED_FILTERS.has(key) && scalar) must.push({ key: `metadata.${key}`, match: { value } });
 }
 return { must };
}

const RERANK_TIMEOUT_MS = 15_000;

/**
 * Cross-encoder rerank through Voyage. `docs` must already be in similarity order: without
 * a key, or when Voyage fails or times out, that order is kept and only truncated.
 */
export async function rerank(query: string, docs: Document[], topK: number): Promise<Document[]> {
 if (docs.length === 0 || !config.voyageApiKey) return docs.slice(0, topK);
 try {
  const res = await fetch('https://api.voyageai.com/v1/rerank', {
   method: 'POST',
   headers: { Authorization: `Bearer ${config.voyageApiKey}`, 'Content-Type': 'application/json' },
   body: JSON.stringify({ model: config.rerankModel, query, top_k: topK, documents: docs.map((d) => d.pageContent) }),
   signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Rerank failed: ${res.status} ${await res.text()}`);
  const { data } = (await res.json()) as { data: { index: number }[] };
  return data.map((r) => docs[r.index]).filter(Boolean);
 } catch (err) {
  // Reranking only improves the order; losing it must not fail the request.
  ragLogger.warn(err, 'rag rerank unavailable; keeping similarity order');
  return docs.slice(0, topK);
 }
}

/**
 * Merges the hits of every search query into one list, best score first. A chunk found
 * by several queries keeps its best score. Sorting matters: concatenating per query would
 * let the first query's hits crowd out all the others once the list is truncated.
 */
export function mergeByScore(results: [Document, number][][]): Document[] {
 const best = new Map<string, [Document, number]>();
 for (const [doc, score] of results.flat()) {
  const key = String(doc.metadata.chunkId ?? doc.id ?? doc.pageContent);
  const seen = best.get(key);
  if (!seen || score > seen[1]) best.set(key, [doc, score]);
 }
 return [...best.values()].sort((a, b) => b[1] - a[1]).map(([doc]) => doc);
}

export async function retrieveNode(state: RagState) {
 const store = vectorStore(queryEmbeddings);
 const filter = buildFilter(state);
 // Each retry casts a wider net.
 const k = config.retrieveK * (1 + state.attempts);
 const results = await Promise.all(state.queries.map((q) => store.similaritySearchWithScore(q, k, filter)));
 // Rerank against the original question, not the rewritten queries.
 const top = await rerank(state.question, mergeByScore(results), state.topK);
 return {
  context: await docstore.loadParents(top),
  // A new retrieval round starts clean: the previous round's draft, citations and verdict
  // refer to sources that may no longer be in context.
  found: false,
  answer: '',
  citedIds: [],
  verification: null,
 };
}
