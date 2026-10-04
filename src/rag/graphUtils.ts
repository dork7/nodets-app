import { randomUUID } from 'node:crypto';

import type { RunnableConfig } from '@langchain/core/runnables';

export interface Step {
 node: string;
 ms: number;
}

/** Marks which graph node or pipeline step an error came from. Nodes tag and rethrow; they never log. */
export class RagError extends Error {
 constructor(
  public stage: string,
  cause: unknown
 ) {
  super(cause instanceof Error ? cause.message : String(cause), { cause });
  this.name = 'RagError';
 }
}

/** An expected failure that maps to a 4xx (or 503) response instead of an error log entry. */
export class HttpError extends Error {
 constructor(
  public statusCode: number,
  public code: string,
  message: string
 ) {
  super(message);
  this.name = 'HttpError';
 }
}

/** The quality gate rejected what was extracted; rerunning the same file would fail the same way. */
export class QualityGateError extends Error {
 constructor(problems: string[]) {
  super(`Quality gate: ${problems.join('; ')}`);
  this.name = 'QualityGateError';
 }
}

export const newId = (prefix: 'doc' | 'par' | 'job' | 'req' | 'err' | 'chk'): string => `${prefix}_${randomUUID()}`;

export function traced<S, U extends object>(stage: string, fn: (state: S, config?: RunnableConfig) => Promise<U>) {
 return async (state: S, config?: RunnableConfig): Promise<U & { steps: Step[] }> => {
  const t0 = Date.now();
  try {
   const update = await fn(state, config);
   return { ...update, steps: [{ node: stage, ms: Date.now() - t0 }] };
  } catch (err) {
   throw err instanceof RagError ? err : new RagError(stage, err);
  }
 };
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping input order. */
export async function mapLimit<T, R>(
 items: T[],
 limit: number,
 fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
 const results = new Array<R>(items.length);
 let next = 0;
 const run = async () => {
  while (next < items.length) {
   const index = next++;
   results[index] = await fn(items[index], index);
  }
 };
 await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
 return results;
}
