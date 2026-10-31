import { TextNode, VectorStoreIndex } from 'llamaindex';

vi.mock('@/config/llamaConfig', () => ({}));
vi.mock('@/config/qdrantStore', () => ({ getQdrantVectorStore: vi.fn(), resetQdrantVectorStore: vi.fn() }));
vi.mock('@/server', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { llamaIndexService } from '@/api/llamaIndex/service';

const scored = (text: string, score: number | undefined, filename = 'doc.pdf') => ({
 node: new TextNode({ text, metadata: { filename, userId: 'u1' } }),
 score,
});

const retrieve = vi.fn();
const asRetriever = vi.fn(() => ({ retrieve }));

describe('llamaIndexService.extract', () => {
 beforeEach(() => {
  vi.spyOn(VectorStoreIndex, 'fromVectorStore').mockResolvedValue({ asRetriever } as never);
  retrieve.mockResolvedValue([scored('close match', 0.91), scored('weak match', 0.42, 'other.pdf')]);
 });

 it('returns every chunk with its score when no cutoff is given', async () => {
  const result = await llamaIndexService.extract('leave policy', 3, 'u1');

  expect(asRetriever).toHaveBeenCalledWith({
   similarityTopK: 3,
   filters: { filters: [{ key: 'userId', value: 'u1', operator: '==' }] },
  });
  expect(result.success).toBe(true);
  expect(result.responseObject?.extractedText).toBe('close match\nweak match');
  expect(result.responseObject?.chunks).toEqual([
   { text: 'close match', score: 0.91, metadata: { filename: 'doc.pdf', userId: 'u1' } },
   { text: 'weak match', score: 0.42, metadata: { filename: 'other.pdf', userId: 'u1' } },
  ]);
  expect(result.responseObject?.sources).toHaveLength(2);
 });

 it('drops chunks scoring below minScore', async () => {
  const result = await llamaIndexService.extract('leave policy', 3, 'u1', 0.5);

  expect(result.responseObject?.extractedText).toBe('close match');
  expect(result.responseObject?.chunks.map((c) => c.score)).toEqual([0.91]);
  expect(result.responseObject?.sources).toEqual([{ filename: 'doc.pdf', userId: 'u1' }]);
 });

 it('keeps a chunk scoring exactly the cutoff', async () => {
  const result = await llamaIndexService.extract('q', 3, 'u1', 0.42);
  expect(result.responseObject?.chunks).toHaveLength(2);
 });

 it('returns empty text when nothing passes the cutoff', async () => {
  const result = await llamaIndexService.extract('q', 3, 'u1', 0.95);
  expect(result.success).toBe(true);
  expect(result.responseObject).toMatchObject({ extractedText: '', sources: [], chunks: [] });
 });

 it('reports a missing score as null and drops it under a cutoff', async () => {
  retrieve.mockResolvedValue([scored('no score', undefined)]);

  expect((await llamaIndexService.extract('q', 3, 'u1')).responseObject?.chunks[0].score).toBeNull();
  expect((await llamaIndexService.extract('q', 3, 'u1', 0)).responseObject?.chunks).toEqual([]);
 });

 it('returns a 500 ServiceResponse when retrieval fails', async () => {
  retrieve.mockRejectedValue(new Error('Qdrant down'));
  const result = await llamaIndexService.extract('q', 3, 'u1', 0.5);
  expect(result.success).toBe(false);
  expect(result.statusCode).toBe(500);
  expect(result.message).toBe('Failed to query index: Qdrant down');
 });
});
