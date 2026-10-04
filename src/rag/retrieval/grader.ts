import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';

import { RAG_GRADER_PROMPT } from '@/config/prompt';
import { invokeStructured } from '@/rag/llm';
import { renderSources } from '@/rag/retrieval/sources';
import type { RagState } from '@/rag/retrieval/state';

const Grades = z.object({
 grades: z.array(z.object({ sourceId: z.string(), relevant: z.boolean() })),
});

const NOTHING_RELEVANT = 'The search returned nothing relevant to the question. Try different search terms.';

/** One batched call; irrelevant sources are dropped. An empty result counts as an attempt and sends the graph back to the analyst. */
export async function gradeNode(state: RagState, config?: RunnableConfig) {
 if (state.context.length === 0) return { attempts: 1, feedback: NOTHING_RELEVANT };

 const { grades } = await invokeStructured(
  'utility',
  Grades,
  [
   new SystemMessage(RAG_GRADER_PROMPT),
   new HumanMessage(`${renderSources(state.context)}\n\nQUESTION: ${state.question}`),
  ],
  config
 );
 const rejected = new Set(grades.filter((g) => !g.relevant).map((g) => g.sourceId));
 // A source the grader did not mention is kept: only an explicit "not relevant" removes it.
 const context = state.context.filter((s) => !rejected.has(s.sourceId));
 return context.length ? { context } : { context, attempts: 1, feedback: NOTHING_RELEVANT };
}
