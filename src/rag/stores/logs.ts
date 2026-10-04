import { newId } from '@/rag/graphUtils';
import { getDb } from '@/rag/stores/mongo';

const MAX = 8_000;
export const clip = <T>(value: T): T => (typeof value === 'string' ? (value.slice(0, MAX) as T) : value);

export interface ErrorInput {
 source: 'api' | 'retrieval' | 'ingestion' | 'process';
 err: unknown;
 level?: 'error' | 'warn';
 stage?: string;
 requestId?: string;
 jobId?: string;
 docId?: string;
 userId?: string;
 context?: Record<string, unknown>;
}

export function createLogs(fallback: { error: (...args: any[]) => void } = console) {
 const requests = () => getDb().collection('rag_request_logs');
 const errors = () => getDb().collection('rag_error_logs');

 return {
  /** Never throws. */
  async request(doc: Record<string, unknown>) {
   try {
    await requests().insertOne(doc);
   } catch (e) {
    fallback.error(e, 'rag request log write failed');
   }
  },

  /** Never throws. Returns the errorId to hand back to the caller. */
  async error(input: ErrorInput): Promise<string> {
   const errorId = newId('err');
   const outer = input.err instanceof Error ? input.err : new Error(String(input.err));
   // RagError wraps the real failure; log the cause and keep the stage it was tagged with.
   const root = outer.cause instanceof Error ? outer.cause : outer;
   const coded = root as { status?: number; code?: string | number };
   try {
    await errors().insertOne({
     errorId,
     createdAt: new Date(),
     level: input.level ?? 'error',
     source: input.source,
     stage: input.stage ?? (outer as { stage?: string }).stage ?? null,
     requestId: input.requestId ?? null,
     jobId: input.jobId ?? null,
     docId: input.docId ?? null,
     userId: input.userId ?? null,
     name: root.name,
     message: clip(root.message),
     stack: clip(root.stack) ?? null,
     code: coded.status ?? coded.code ?? null,
     context: input.context ?? {},
    });
   } catch (e) {
    fallback.error(e, `rag error log write failed (original: ${outer.message})`);
   }
   return errorId;
  },
 };
}

export type Logs = ReturnType<typeof createLogs>;
