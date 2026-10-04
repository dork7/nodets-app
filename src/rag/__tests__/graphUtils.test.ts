import { HttpError, mapLimit, newId, QualityGateError, RagError, traced } from '@/rag/graphUtils';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('traced', () => {
 it('adds one step named after the stage to the node update', async () => {
  const node = traced('retrieve', async (state: { question: string }) => ({ context: [state.question] }));
  const update = await node({ question: 'q' });

  expect(update).toEqual({ context: ['q'], steps: [{ node: 'retrieve', ms: expect.any(Number) }] });
  expect(update.steps[0].ms).toBeGreaterThanOrEqual(0);
 });

 it('measures how long the node took', async () => {
  vi.useFakeTimers();
  try {
   const pending = traced('slow', async () => {
    await tick(250);
    return {};
   })({});
   await vi.advanceTimersByTimeAsync(250);
   expect((await pending).steps).toEqual([{ node: 'slow', ms: 250 }]);
  } finally {
   vi.useRealTimers();
  }
 });

 it('passes the state and the run config through to the node', async () => {
  const fn = vi.fn(async () => ({}));
  const config = { configurable: { thread_id: 't1' } };
  await traced('grade', fn)({ a: 1 }, config);
  expect(fn).toHaveBeenCalledWith({ a: 1 }, config);
 });

 it('wraps a thrown error in RagError tagged with the stage, keeping the cause', async () => {
  const cause = new Error('qdrant down');
  const err = await traced('retrieve', async () => {
   throw cause;
  })({}).catch((e) => e);

  expect(err).toBeInstanceOf(RagError);
  expect(err).toMatchObject({ name: 'RagError', stage: 'retrieve', message: 'qdrant down' });
  expect(err.cause).toBe(cause);
 });

 it('wraps an HttpError too, leaving it reachable as the cause', async () => {
  const cause = new HttpError(503, 'llm_not_configured', 'no key');
  const err = await traced('analyst', async () => {
   throw cause;
  })({}).catch((e) => e);

  expect(err).toBeInstanceOf(RagError);
  expect(err.cause).toBe(cause);
 });

 it('wraps a thrown non-error, using its string form as the message', async () => {
  const err = await traced('parse', async () => {
   throw 'plain string';
  })({}).catch((e) => e);

  expect(err).toBeInstanceOf(RagError);
  expect(err).toMatchObject({ stage: 'parse', message: 'plain string', cause: 'plain string' });
 });

 it('does not double-wrap: the innermost stage is kept', async () => {
  const inner = new RagError('imageAgent', new Error('429'));
  const err = await traced('outer', async () => {
   throw inner;
  })({}).catch((e) => e);

  expect(err).toBe(inner);
  expect(err.stage).toBe('imageAgent');
 });

 it('wraps a synchronous throw from a node that is not async', async () => {
  const node = traced('sync', (() => {
   throw new Error('sync boom');
  }) as unknown as () => Promise<object>);

  await expect(node({})).rejects.toMatchObject({ name: 'RagError', stage: 'sync', message: 'sync boom' });
 });
});

describe('mapLimit', () => {
 it('returns results in input order even when later items finish first', async () => {
  const delays = [30, 5, 20, 0, 10];
  const finished: number[] = [];
  const results = await mapLimit(delays, 3, async (ms, index) => {
   await tick(ms);
   finished.push(index);
   return `item-${index}`;
  });

  expect(results).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
  expect(finished).not.toEqual([0, 1, 2, 3, 4]);
 });

 it.each([
  [1, 1],
  [2, 2],
  [4, 4],
  [50, 10],
 ])('with limit %i never runs more than %i at once, and uses the full allowance', async (limit, expectedPeak) => {
  let inFlight = 0;
  let peak = 0;
  const calls: number[] = [];
  await mapLimit(
   Array.from({ length: 10 }, (_, i) => i),
   limit,
   async (item) => {
    calls.push(item);
    peak = Math.max(peak, ++inFlight);
    await tick(1);
    inFlight--;
   }
  );

  expect(peak).toBe(expectedPeak);
  expect(calls.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
 });

 it('passes the item and its index', async () => {
  expect(await mapLimit(['a', 'b'], 2, async (item, index) => `${index}:${item}`)).toEqual(['0:a', '1:b']);
 });

 it('returns an empty array, without calling fn, for no items', async () => {
  const fn = vi.fn();
  expect(await mapLimit([], 4, fn)).toEqual([]);
  expect(fn).not.toHaveBeenCalled();
 });

 it('rejects with the first failure and starts no further items on that worker', async () => {
  const started: number[] = [];
  const run = mapLimit([0, 1, 2, 3], 1, async (item) => {
   started.push(item);
   if (item === 1) throw new Error('item 1 failed');
   return item;
  });

  await expect(run).rejects.toThrow('item 1 failed');
  expect(started).toEqual([0, 1]);
 });
});

describe('ids and error types', () => {
 it('generates unique, prefixed ids', () => {
  const ids = Array.from({ length: 50 }, () => newId('doc'));
  expect(new Set(ids).size).toBe(50);
  expect(ids.every((id) => /^doc_[0-9a-f-]{36}$/.test(id))).toBe(true);
  expect(newId('job')).toMatch(/^job_/);
 });

 it('joins quality-gate problems into one message', () => {
  const err = new QualityGateError(['no text', '2 image(s) have an empty description']);
  expect(err).toMatchObject({
   name: 'QualityGateError',
   message: 'Quality gate: no text; 2 image(s) have an empty description',
  });
 });

 it('carries status and machine code on HttpError', () => {
  expect(new HttpError(404, 'not_found', 'Job not found')).toMatchObject({
   name: 'HttpError',
   statusCode: 404,
   code: 'not_found',
   message: 'Job not found',
  });
 });
});
