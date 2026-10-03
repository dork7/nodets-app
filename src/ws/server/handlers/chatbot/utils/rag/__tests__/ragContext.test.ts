import { llamaIndexService } from '@/api/llamaIndex/service';

import { injectRagContext } from '../ragContext';
import { isRagAnswerRelated } from '../relevanceCheck';

vi.mock('@/api/llamaIndex/service', () => ({ llamaIndexService: { extract: vi.fn() } }));
vi.mock('../relevanceCheck', () => ({ isRagAnswerRelated: vi.fn() }));
vi.mock('@/common/utils/envConfig', () => ({ env: { RAG_TOP_K: 4 } }));
vi.mock('@/server', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const extract = vi.mocked(llamaIndexService.extract);
const relevant = vi.mocked(isRagAnswerRelated);

const success = (chunks: { text: string; score: number | null; filename?: string }[]) =>
 ({
  success: true,
  responseObject: {
   extractedText: chunks.map((c) => c.text).join('\n'),
   sources: chunks.map((c) => ({ filename: c.filename })),
   chunks: chunks.map((c) => ({ text: c.text, score: c.score, metadata: { filename: c.filename } })),
  },
 }) as never;

describe('injectRagContext', () => {
 beforeEach(() => {
  relevant.mockResolvedValue(true);
 });

 it('passes a valid minScore through and returns per-chunk text and scores', async () => {
  extract.mockResolvedValue(success([{ text: 'Leave is 30 days', score: 0.88, filename: 'policy.doc' }]));
  const aiMessages: any[] = [{ role: 'user', content: 'leave?' }];

  const sources = await injectRagContext(aiMessages, 'leave?', 'u1', 's1', 0.7);

  expect(extract).toHaveBeenCalledWith('leave?', 4, 'u1', 0.7);
  expect(sources).toEqual([{ id: '0', text: 'Leave is 30 days', score: 0.88, source: 'policy.doc' }]);
  expect(aiMessages[0].role).toBe('system');
  expect(aiMessages[0].content).toContain('Leave is 30 days');
 });

 it.each([[undefined], [-0.1], [1.5], [Number.NaN]])('sends no cutoff for minScore %s', async (minScore) => {
  extract.mockResolvedValue(success([]));
  await injectRagContext([], 'q', 'u1', 's1', minScore);
  expect(extract).toHaveBeenCalledWith('q', 4, 'u1', undefined);
 });

 it('injects nothing when no chunk passed the cutoff', async () => {
  extract.mockResolvedValue(success([]));
  const aiMessages: any[] = [];

  await expect(injectRagContext(aiMessages, 'q', 'u1', 's1', 0.9)).resolves.toEqual([]);
  expect(aiMessages).toEqual([]);
  expect(relevant).not.toHaveBeenCalled();
 });

 it('injects nothing when the relevance check rejects the context', async () => {
  extract.mockResolvedValue(success([{ text: 'unrelated', score: 0.6 }]));
  relevant.mockResolvedValue(false);
  const aiMessages: any[] = [];

  await expect(injectRagContext(aiMessages, 'q', 'u1', 's1')).resolves.toEqual([]);
  expect(aiMessages).toEqual([]);
 });
});
