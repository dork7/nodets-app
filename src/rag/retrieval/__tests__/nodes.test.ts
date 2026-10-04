import type { BaseMessage } from '@langchain/core/messages';

const similaritySearch = vi.fn();
vi.mock('@/rag/config', () => ({ config: { retrieveK: 5, voyageApiKey: 'voyage-key', rerankModel: 'rerank-test' } }));
vi.mock('@/rag/embeddings', () => ({ queryEmbeddings: { marker: 'query-embeddings' } }));
vi.mock('@/rag/stores/qdrant', () => ({ vectorStore: vi.fn() }));
vi.mock('@/rag/stores/docstore', () => ({ loadParents: vi.fn() }));
vi.mock('@/rag/stores/blobs', () => ({ readBlob: vi.fn(), saveBlob: vi.fn(), deleteBlobs: vi.fn() }));
vi.mock('@/rag/llm', () => ({ invokeStructured: vi.fn() }));

import { RAG_ANSWER_PROMPT, RAG_GRADER_PROMPT, RAG_QUERY_ANALYST_PROMPT } from '@/config/prompt';
import { queryEmbeddings } from '@/rag/embeddings';
import { invokeStructured } from '@/rag/llm';
import { answerNode } from '@/rag/retrieval/answerer';
import { gradeNode } from '@/rag/retrieval/grader';
import { queryAnalystNode } from '@/rag/retrieval/queryAnalyst';
import { mergeByScore, rerank, retrieveNode } from '@/rag/retrieval/retriever';
import { renderSources } from '@/rag/retrieval/sources';
import type { RagState } from '@/rag/retrieval/state';
import type { Verification } from '@/rag/retrieval/verifier';
import * as docstore from '@/rag/stores/docstore';
import { vectorStore } from '@/rag/stores/qdrant';
import type { Source } from '@/rag/types';

const llm = vi.mocked(invokeStructured);
const messages = () => llm.mock.calls[0][2] as BaseMessage[];
const runConfig = { configurable: { thread_id: 't1' } };

const source = (sourceId: string, content = `content ${sourceId}`): Source => ({
 sourceId,
 parentId: `par_${sourceId}`,
 docId: 'doc_1',
 filename: 'report.pdf',
 page: 1,
 modality: 'text',
 content,
 blobId: null,
});

const state = (overrides: Partial<RagState> = {}): RagState => ({
 requestId: 'req_1',
 question: 'What was revenue in 2025?',
 collection: 'finance',
 mode: 'answer',
 principal: { id: 'u1', acl: ['user:u1', '*'] },
 filters: {},
 inferredFilters: {},
 topK: 3,
 needsRetrieval: true,
 queries: [],
 context: [],
 found: false,
 answer: '',
 citedIds: [],
 verification: null,
 feedback: '',
 attempts: 0,
 steps: [],
 ...overrides,
});

const rejection: Verification = {
 claims: [{ claim: 'Revenue was 500M', supported: false, sourceId: null, evidence: null }],
 answersQuestion: true,
 verdict: 'unsupported',
 failureType: 'unsupported_claims',
 feedback: 'The 500M figure is not in any source.',
 confidence: 0.8,
};

beforeEach(() => {
 llm.mockReset();
 similaritySearch.mockReset();
 vi
  .mocked(vectorStore)
  .mockReset()
  .mockReturnValue({ similaritySearchWithScore: similaritySearch } as never);
 vi.mocked(docstore.loadParents).mockReset().mockResolvedValue([]);
});

describe('queryAnalystNode', () => {
 it('returns the trimmed queries and the inferred modality filter on a first pass', async () => {
  llm.mockResolvedValue({
   needsRetrieval: true,
   queries: ['  revenue 2025 ', '', 'income statement'],
   modality: 'table',
  });

  expect(await queryAnalystNode(state({ feedback: 'stale feedback' }), runConfig)).toEqual({
   needsRetrieval: true,
   queries: ['revenue 2025', 'income statement'],
   inferredFilters: { modality: 'table' },
  });
  expect(llm.mock.calls[0][0]).toBe('utility');
  expect(llm.mock.calls[0][3]).toBe(runConfig);
  expect(messages()[0].content).toBe(RAG_QUERY_ANALYST_PROMPT);
  // Feedback belongs to a retry; it is not sent on the first attempt.
  expect(messages()[1].content).toBe('QUESTION: What was revenue in 2025?');
 });

 it.each([
  ['no queries', []],
  ['only blank queries', ['', '   ']],
 ])('falls back to the question when the model returns %s', async (_label, queries) => {
  llm.mockResolvedValue({ needsRetrieval: true, queries, modality: null });

  expect(await queryAnalystNode(state())).toEqual({
   needsRetrieval: true,
   queries: ['What was revenue in 2025?'],
   inferredFilters: {},
  });
 });

 it('caps the plan at four queries, keeping the first ones', async () => {
  llm.mockResolvedValue({ needsRetrieval: true, queries: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], modality: null });
  expect((await queryAnalystNode(state())).queries).toEqual(['q1', 'q2', 'q3', 'q4']);
 });

 it('drops the inferred filter and passes the feedback on a retry', async () => {
  llm.mockResolvedValue({ needsRetrieval: true, queries: ['q1'], modality: 'table' });

  const update = await queryAnalystNode(state({ attempts: 1, feedback: 'Try different search terms.' }));

  expect(update.inferredFilters).toEqual({});
  expect(messages()[1].content).toBe('QUESTION: What was revenue in 2025?\n\nFEEDBACK: Try different search terms.');
 });

 it('reports that no retrieval is needed', async () => {
  llm.mockResolvedValue({ needsRetrieval: false, queries: [], modality: null });
  expect((await queryAnalystNode(state())).needsRetrieval).toBe(false);
 });
});

describe('gradeNode', () => {
 it('counts an attempt, without a model call, when the context is empty', async () => {
  const update = await gradeNode(state({ context: [] }));

  expect(update).toEqual({ attempts: 1, feedback: expect.stringMatching(/nothing relevant/i) });
  expect(llm).not.toHaveBeenCalled();
 });

 it('removes only the sources the grader explicitly rejected, keeping unmentioned ones', async () => {
  const context = [source('S1'), source('S2'), source('S3')];
  llm.mockResolvedValue({
   grades: [
    { sourceId: 'S1', relevant: true },
    { sourceId: 'S2', relevant: false },
    { sourceId: 'S9', relevant: false },
   ],
  });

  const update = await gradeNode(state({ context }), runConfig);

  expect(update).toEqual({ context: [context[0], context[2]] });
  expect(llm.mock.calls[0][0]).toBe('utility');
  expect(llm.mock.calls[0][3]).toBe(runConfig);
  expect(messages()[0].content).toBe(RAG_GRADER_PROMPT);
  expect(messages()[1].content).toBe(`${renderSources(context)}\n\nQUESTION: What was revenue in 2025?`);
 });

 it('keeps everything when the grader returns no grades', async () => {
  const context = [source('S1'), source('S2')];
  llm.mockResolvedValue({ grades: [] });
  expect(await gradeNode(state({ context }))).toEqual({ context });
 });

 it('counts an attempt and asks for different terms when every source is rejected', async () => {
  llm.mockResolvedValue({
   grades: [
    { sourceId: 'S1', relevant: false },
    { sourceId: 'S2', relevant: false },
   ],
  });

  expect(await gradeNode(state({ context: [source('S1'), source('S2')] }))).toEqual({
   context: [],
   attempts: 1,
   feedback: expect.stringMatching(/nothing relevant/i),
  });
 });
});

describe('answerNode', () => {
 const context = [source('S1', '| 2025 | 412 |'), source('S2', 'Costs fell.')];

 it('parses the cited ids from the answer text and resets the verification', async () => {
  llm.mockResolvedValue({ found: true, answer: 'Revenue was 412M [S2]. Costs fell [S1][S2].' });

  const update = await answerNode(state({ context, verification: { ...rejection, verdict: 'supported' } }), runConfig);

  expect(update).toEqual({
   found: true,
   answer: 'Revenue was 412M [S2]. Costs fell [S1][S2].',
   citedIds: ['S2', 'S1'],
   attempts: 1,
   verification: null,
   feedback: '',
  });
  expect(llm.mock.calls[0][0]).toBe('answer');
  expect(llm.mock.calls[0][3]).toBe(runConfig);
  expect(messages()[0].content).toBe(RAG_ANSWER_PROMPT);
  // Sources first and the question last; no correction when the last verdict was "supported".
  expect(messages()[1].content).toBe(`${renderSources(context)}\n\nQUESTION: What was revenue in 2025?`);
 });

 it('includes the verifier feedback when the previous draft was rejected', async () => {
  llm.mockResolvedValue({ found: true, answer: 'Revenue was 412M [S1].' });

  await answerNode(state({ context, verification: rejection, attempts: 1 }));

  const prompt = messages()[1].content as string;
  expect(prompt.startsWith(`${renderSources(context)}\n\nQUESTION: What was revenue in 2025?`)).toBe(true);
  expect(prompt).toMatch(/previous answer was rejected/);
  expect(prompt.endsWith('The 500M figure is not in any source.')).toBe(true);
 });

 it('adds no correction for a rejection that carries no feedback', async () => {
  llm.mockResolvedValue({ found: true, answer: 'x [S1].' });
  await answerNode(state({ context, verification: { ...rejection, feedback: '' } }));
  expect(messages()[1].content).not.toMatch(/previous answer was rejected/);
 });

 it('asks for a different search when the sources do not contain the answer', async () => {
  llm.mockResolvedValue({ found: false, answer: 'I could not find that.' });

  expect(await answerNode(state({ context }))).toEqual({
   found: false,
   answer: 'I could not find that.',
   citedIds: [],
   attempts: 1,
   verification: null,
   feedback: expect.stringMatching(/did not contain the answer/),
  });
 });
});

describe('retrieveNode', () => {
 const doc = (chunkId: string, parentId = `par_${chunkId}`) => ({
  pageContent: `text ${chunkId}`,
  metadata: { chunkId, parentId },
 });
 /** Search results as [document, score] pairs, best first. */
 const scored = (...docs: ReturnType<typeof doc>[]) => docs.map((d, i) => [d, 1 - i * 0.1] as const);
 /** Voyage answers with the candidates in the order it is given, unless told otherwise. */
 const voyage = (indexes?: number[]) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
   const body = JSON.parse(String(init?.body));
   const order = indexes ?? body.documents.map((_: string, i: number) => i).slice(0, body.top_k);
   return new Response(JSON.stringify({ data: order.map((index: number) => ({ index })) }), { status: 200 });
  });
 const sentToVoyage = (spy: ReturnType<typeof voyage>) => JSON.parse(String(spy.mock.calls[0][1]?.body));

 it('searches every query with the access filter and k = retrieveK on the first attempt', async () => {
  voyage();
  similaritySearch.mockResolvedValue([]);

  await retrieveNode(state({ queries: ['q1', 'q2'], filters: { page: 3 }, inferredFilters: { modality: 'table' } }));

  expect(vectorStore).toHaveBeenCalledWith(queryEmbeddings);
  const filter = {
   must: [
    { key: 'metadata.collection', match: { value: 'finance' } },
    { key: 'metadata.acl', match: { any: ['user:u1', '*'] } },
    { key: 'metadata.modality', match: { value: 'table' } },
    { key: 'metadata.page', match: { value: 3 } },
   ],
  };
  expect(similaritySearch.mock.calls).toEqual([
   ['q1', 5, filter],
   ['q2', 5, filter],
  ]);
 });

 it.each([
  [1, 10],
  [2, 15],
 ])('widens k after %i attempt(s) to %i', async (attempts, k) => {
  voyage();
  similaritySearch.mockResolvedValue([]);
  await retrieveNode(state({ queries: ['q1'], attempts }));
  expect(similaritySearch).toHaveBeenCalledWith('q1', k, expect.anything());
 });

 it('de-duplicates hits by chunkId across queries before reranking', async () => {
  const spy = voyage();
  similaritySearch
   .mockResolvedValueOnce(scored(doc('chk_a'), doc('chk_b')))
   .mockResolvedValueOnce(scored(doc('chk_b'), doc('chk_c'), doc('chk_a')));

  await retrieveNode(state({ queries: ['q1', 'q2'], topK: 10 }));

  expect(sentToVoyage(spy).documents).toEqual(['text chk_a', 'text chk_b', 'text chk_c']);
  expect(vi.mocked(docstore.loadParents).mock.calls[0][0].map((d) => d.metadata.chunkId)).toEqual([
   'chk_a',
   'chk_b',
   'chk_c',
  ]);
 });

 it('reranks against the original question, not the rewritten queries, and loads parents in reranked order', async () => {
  const spy = voyage([2, 0]);
  similaritySearch.mockResolvedValue(scored(doc('chk_a'), doc('chk_b'), doc('chk_c')));
  const sources = [source('S1'), source('S2')];
  vi.mocked(docstore.loadParents).mockResolvedValue(sources);

  const update = await retrieveNode(state({ queries: ['rewritten query'], topK: 2 }));

  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][0]).toBe('https://api.voyageai.com/v1/rerank');
  expect((spy.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer voyage-key');
  expect(sentToVoyage(spy)).toEqual({
   model: 'rerank-test',
   query: 'What was revenue in 2025?',
   top_k: 2,
   documents: ['text chk_a', 'text chk_b', 'text chk_c'],
  });
  expect(vi.mocked(docstore.loadParents).mock.calls[0][0].map((d) => d.metadata.chunkId)).toEqual(['chk_c', 'chk_a']);
  // A new retrieval round also clears the previous round's draft and verdict.
  expect(update).toEqual({ context: sources, found: false, answer: '', citedIds: [], verification: null });
 });

 it('skips the rerank call when the search found nothing', async () => {
  const spy = voyage();
  similaritySearch.mockResolvedValue([]);

  expect(await retrieveNode(state({ queries: ['q1'] }))).toMatchObject({ context: [] });
  expect(spy).not.toHaveBeenCalled();
  expect(docstore.loadParents).toHaveBeenCalledWith([]);
 });

 it('fails the node when a search fails', async () => {
  voyage();
  similaritySearch.mockResolvedValueOnce(scored(doc('chk_a'))).mockRejectedValueOnce(new Error('qdrant down'));
  await expect(retrieveNode(state({ queries: ['q1', 'q2'] }))).rejects.toThrow('qdrant down');
  expect(docstore.loadParents).not.toHaveBeenCalled();
 });
});

describe('mergeByScore', () => {
 const hit = (chunkId: string) => ({ pageContent: chunkId, metadata: { chunkId } });

 it('interleaves the hits of all queries by score, so later queries are not crowded out', () => {
  const merged = mergeByScore([
   [
    [hit('q1_a'), 0.9],
    [hit('q1_b'), 0.5],
   ],
   [
    [hit('q2_a'), 0.8],
    [hit('q2_b'), 0.4],
   ],
  ]);
  expect(merged.map((d) => d.metadata.chunkId)).toEqual(['q1_a', 'q2_a', 'q1_b', 'q2_b']);
 });

 it('keeps one copy of a chunk found by several queries, at its best score', () => {
  const merged = mergeByScore([
   [
    [hit('shared'), 0.3],
    [hit('other'), 0.6],
   ],
   [[hit('shared'), 0.95]],
  ]);
  expect(merged.map((d) => d.metadata.chunkId)).toEqual(['shared', 'other']);
 });
});

describe('rerank with a Voyage key', () => {
 const docs = ['a', 'b', 'c'].map((pageContent) => ({ pageContent, metadata: {} }));

 it('returns the documents in the order Voyage ranks them', async () => {
  vi
   .spyOn(globalThis, 'fetch')
   .mockResolvedValue(new Response(JSON.stringify({ data: [{ index: 1 }, { index: 2 }] }), { status: 200 }));
  expect(await rerank('q', docs, 2)).toEqual([docs[1], docs[2]]);
 });

 it.each([
  ['Voyage rejects the request', () => Promise.resolve(new Response('rate limited', { status: 429 }))],
  ['the call fails or times out', () => Promise.reject(new Error('timeout'))],
 ])('keeps the similarity order instead of failing the request when %s', async (_label, respond) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(respond);
  expect(await rerank('q', docs, 2)).toEqual([docs[0], docs[1]]);
 });
});
