import { Annotation } from '@langchain/langgraph';

import type { Step } from '@/rag/graphUtils';
import type { Verification } from '@/rag/retrieval/verifier';
import type { Principal, Source } from '@/rag/types';

export const RAGState = Annotation.Root({
 requestId: Annotation<string>(),
 question: Annotation<string>(),
 collection: Annotation<string>(),
 mode: Annotation<'answer' | 'chunks'>(),
 principal: Annotation<Principal>(),
 /** Filters the caller sent; always applied. */
 filters: Annotation<Record<string, unknown>>(),
 /** Filters the Query Analyst inferred; dropped on a retry so a wrong guess cannot hide the answer. */
 inferredFilters: Annotation<Record<string, unknown>>(),
 topK: Annotation<number>(),
 needsRetrieval: Annotation<boolean>(),
 queries: Annotation<string[]>(),
 context: Annotation<Source[]>(),
 found: Annotation<boolean>(),
 answer: Annotation<string>(),
 citedIds: Annotation<string[]>(),
 verification: Annotation<Verification | null>(),
 feedback: Annotation<string>(),
 // Nodes return { attempts: 1 }; both retry loops count against this one counter.
 attempts: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
 steps: Annotation<Step[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

export type RagState = typeof RAGState.State;
