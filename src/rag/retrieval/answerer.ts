import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';

import { RAG_ANSWER_PROMPT } from '@/config/prompt';
import { invokeStructured } from '@/rag/llm';
import { parseCitedIds, renderSources } from '@/rag/retrieval/sources';
import type { RagState } from '@/rag/retrieval/state';

const Answer = z.object({
 found: z.boolean().describe('Whether the sources contain the answer'),
 answer: z.string().describe('The answer in Markdown, each factual sentence cited like [S1]'),
});

export async function answerNode(state: RagState, config?: RunnableConfig) {
 // A verifier rejection of the previous draft is passed back so the unsupported claims get fixed.
 const correction =
  state.verification && state.verification.verdict !== 'supported' && state.verification.feedback
   ? `\n\nA previous answer was rejected. These claims were not supported - remove or correct them: ${state.verification.feedback}`
   : '';
 // Stable part first (instructions, then sources) and the question last, so the prefix can be cached across retries.
 const result = await invokeStructured(
  'answer',
  Answer,
  [
   new SystemMessage(RAG_ANSWER_PROMPT),
   new HumanMessage(`${renderSources(state.context)}\n\nQUESTION: ${state.question}${correction}`),
  ],
  config
 );
 return {
  found: result.found,
  answer: result.answer,
  citedIds: parseCitedIds(result.answer),
  attempts: 1,
  // A fresh draft has not been verified yet.
  verification: null,
  feedback: result.found ? '' : 'The retrieved sources did not contain the answer. Search for it differently.',
 };
}
