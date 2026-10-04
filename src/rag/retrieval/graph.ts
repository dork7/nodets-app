import { END, START, StateGraph } from '@langchain/langgraph';

import { RAG_ABSTAIN_MESSAGE } from '@/config/prompt';
import { config } from '@/rag/config';
import { traced } from '@/rag/graphUtils';
import { answerNode } from '@/rag/retrieval/answerer';
import { gradeNode } from '@/rag/retrieval/grader';
import { queryAnalystNode } from '@/rag/retrieval/queryAnalyst';
import { retrieveNode } from '@/rag/retrieval/retriever';
import { RAGState, type RagState } from '@/rag/retrieval/state';
import { verifyNode } from '@/rag/retrieval/verifier';

const exhausted = (s: RagState) => s.attempts >= config.maxAttempts;

export const afterAnalyst = (s: RagState) => (s.needsRetrieval ? 'retriever' : 'abstain');

export const afterGrader = (s: RagState) => {
 if (s.context.length === 0) return exhausted(s) ? 'abstain' : 'analyst';
 return s.mode === 'chunks' ? 'done' : 'answerer';
};

export const afterAnswerer = (s: RagState) => (s.found ? 'verifier' : exhausted(s) ? 'abstain' : 'analyst');

export const afterVerifier = (s: RagState) => {
 const v = s.verification!;
 if (v.verdict === 'supported') return 'done';
 if (exhausted(s)) return 'abstain';
 return v.failureType === 'unsupported_claims' ? 'answerer' : 'analyst';
};

/**
 * Deterministic, no model call: the answer is rebuilt from the claims the verifier
 * already confirmed, or replaced by a plain "not found" message when none remain.
 */
export async function abstainNode(state: RagState) {
 if (state.mode === 'chunks') return {};
 const supported = state.found ? (state.verification?.claims ?? []).filter((c) => c.supported) : [];
 if (!supported.length) return { answer: RAG_ABSTAIN_MESSAGE, citedIds: [] };
 return {
  answer: supported.map((c) => `${c.claim}${c.sourceId ? ` [${c.sourceId}]` : ''}`).join('\n'),
  citedIds: [...new Set(supported.map((c) => c.sourceId).filter((id): id is string => !!id))],
 };
}

type NodeFn = (state: RagState, config?: any) => Promise<object>;

export interface RetrievalNodes {
 analyst: NodeFn;
 retriever: NodeFn;
 grader: NodeFn;
 answerer: NodeFn;
 verifier: NodeFn;
}

const defaultNodes: RetrievalNodes = {
 analyst: queryAnalystNode,
 retriever: retrieveNode,
 grader: gradeNode,
 answerer: answerNode,
 verifier: verifyNode,
};

/** Node functions are injectable so every routing path can be exercised without a model or a vector store. */
export function buildRetrievalGraph(nodes: RetrievalNodes = defaultNodes) {
 // Node names must differ from state keys in LangGraph: `answerer`/`verifier` vs `answer`/`verification`.
 return new StateGraph(RAGState)
  .addNode('analyst', traced('analyst', nodes.analyst))
  .addNode('retriever', traced('retriever', nodes.retriever))
  .addNode('grader', traced('grader', nodes.grader))
  .addNode('answerer', traced('answerer', nodes.answerer))
  .addNode('verifier', traced('verifier', nodes.verifier))
  .addNode('abstain', traced('abstain', abstainNode))
  .addEdge(START, 'analyst')
  .addConditionalEdges('analyst', afterAnalyst, { retriever: 'retriever', abstain: 'abstain' })
  .addEdge('retriever', 'grader')
  .addConditionalEdges('grader', afterGrader, {
   answerer: 'answerer',
   analyst: 'analyst',
   abstain: 'abstain',
   done: END,
  })
  .addConditionalEdges('answerer', afterAnswerer, { verifier: 'verifier', analyst: 'analyst', abstain: 'abstain' })
  .addConditionalEdges('verifier', afterVerifier, {
   done: END,
   answerer: 'answerer',
   analyst: 'analyst',
   abstain: 'abstain',
  })
  .addEdge('abstain', END)
  .compile();
}

export const retrievalGraph = buildRetrievalGraph();
