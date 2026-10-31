import { HISTORY_SUMMARY_PREFIX } from '@/config/prompt';

import { ChatMessage } from '../../../types';
import { compactHistory } from '../compaction';

const { env, callAI } = vi.hoisted(() => ({
 env: { CHAT_HISTORY_COMPACT_THRESHOLD_CHARS: 100, CHAT_HISTORY_KEEP_RECENT: 2 },
 callAI: vi.fn(),
}));

vi.mock('@/common/utils/envConfig', () => ({ env }));
vi.mock('@/config/openaiConfig', () => ({ callAI }));
vi.mock('@/server', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const message = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content });
const reply = (content: string | null) => ({ choices: [{ message: { content } }] });
const options = { provider: 'openRouterAI', model: 'some-model' };

const longHistory: ChatMessage[] = [
 message('user', 'a'.repeat(40)),
 message('assistant', 'b'.repeat(40)),
 message('user', 'c'.repeat(40)),
 message('assistant', 'd'.repeat(40)),
];

describe('compactHistory', () => {
 beforeEach(() => {
  env.CHAT_HISTORY_COMPACT_THRESHOLD_CHARS = 100;
  env.CHAT_HISTORY_KEEP_RECENT = 2;
 });

 it('leaves history under the size threshold untouched', async () => {
  const history = [message('user', 'hi'), message('assistant', 'hello'), message('user', 'how are you?')];

  const result = await compactHistory(history, options);

  expect(result).toEqual({ history, compacted: false });
  expect(callAI).not.toHaveBeenCalled();
 });

 it('leaves history with no more messages than it keeps untouched, however large', async () => {
  const history = [message('user', 'x'.repeat(500)), message('assistant', 'y'.repeat(500))];

  const result = await compactHistory(history, options);

  expect(result.compacted).toBe(false);
  expect(callAI).not.toHaveBeenCalled();
 });

 it('summarizes older messages and keeps the most recent ones verbatim', async () => {
  callAI.mockResolvedValueOnce(reply('  The user asked about a and b.  '));

  const result = await compactHistory(longHistory, options);

  expect(result.compacted).toBe(true);
  expect(result.history).toEqual([
   { role: 'system', content: `${HISTORY_SUMMARY_PREFIX}\nThe user asked about a and b.` },
   longHistory[2],
   longHistory[3],
  ]);
 });

 it("calls the chat's own provider and model with only the older messages", async () => {
  const signal = new AbortController().signal;
  callAI.mockResolvedValueOnce(reply('summary'));

  await compactHistory(longHistory, { ...options, signal });

  expect(callAI).toHaveBeenCalledTimes(1);
  const [model, messages, callOptions, passedSignal] = callAI.mock.calls[0];
  expect(model).toBe('some-model');
  expect(callOptions).toMatchObject({ stream: false, provider: 'openRouterAI' });
  expect(passedSignal).toBe(signal);
  const prompt: string = messages[0].content;
  expect(prompt).toContain(`user: ${'a'.repeat(40)}`);
  expect(prompt).toContain(`assistant: ${'b'.repeat(40)}`);
  expect(prompt).not.toContain('c'.repeat(40));
 });

 it('folds a previous summary into the next compaction', async () => {
  const previousSummary = message('system', `${HISTORY_SUMMARY_PREFIX}\nearlier facts`);
  callAI.mockResolvedValueOnce(reply('merged summary'));

  const result = await compactHistory([previousSummary, ...longHistory], options);

  expect(callAI.mock.calls[0][1][0].content).toContain('earlier facts');
  expect(result.history.filter((m) => m.role === 'system')).toHaveLength(1);
  expect(result.history[0].content).toBe(`${HISTORY_SUMMARY_PREFIX}\nmerged summary`);
 });

 it('keeps the full history when the summarizer fails', async () => {
  callAI.mockRejectedValueOnce(new Error('Connection error.'));

  const result = await compactHistory(longHistory, options);

  expect(result).toEqual({ history: longHistory, compacted: false });
 });

 it('keeps the full history when the summarizer returns nothing', async () => {
  callAI.mockResolvedValueOnce(reply('   '));

  const result = await compactHistory(longHistory, options);

  expect(result).toEqual({ history: longHistory, compacted: false });
 });

 it('rethrows when the request was aborted, so the turn stops', async () => {
  const controller = new AbortController();
  controller.abort();
  callAI.mockRejectedValueOnce(new Error('Request was aborted.'));

  await expect(compactHistory(longHistory, { ...options, signal: controller.signal })).rejects.toThrow(
   'Request was aborted.'
  );
 });
});
