import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';

import { RAG_QUERY_ANALYST_PROMPT } from '@/config/prompt';
import { invokeStructured } from '@/rag/llm';
import type { RagState } from '@/rag/retrieval/state';

const QueryPlan = z.object({
 needsRetrieval: z.boolean(),
 queries: z.array(z.string()).describe('One to four standalone search queries'),
 modality: z.enum(['text', 'table', 'image']).nullable().describe('Only when the question is clearly about one'),
});

const MAX_QUERIES = 4;

export async function queryAnalystNode(state: RagState, config?: RunnableConfig) {
 const retrying = state.attempts > 0;
 const plan = await invokeStructured(
  'utility',
  QueryPlan,
  [
   new SystemMessage(RAG_QUERY_ANALYST_PROMPT),
   new HumanMessage(
    [`QUESTION: ${state.question}`, retrying && state.feedback ? `FEEDBACK: ${state.feedback}` : '']
     .filter(Boolean)
     .join('\n\n')
   ),
  ],
  config
 );
 const queries = plan.queries
  .map((q) => q.trim())
  .filter(Boolean)
  .slice(0, MAX_QUERIES);
 return {
  needsRetrieval: plan.needsRetrieval,
  queries: queries.length ? queries : [state.question],
  // On a retry the inferred filter is relaxed: a wrong guess must not keep hiding the answer.
  inferredFilters: !retrying && plan.modality ? { modality: plan.modality } : {},
 };
}
