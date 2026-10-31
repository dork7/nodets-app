import { llamaIndexService } from '@/api/llamaIndex/service';
import { env } from '@/common/utils/envConfig';
import { buildRagGuardrailPrompt } from '@/config/prompt';
import { logger } from '@/server';

import { RagChunk } from '../../types';
import { isRagAnswerRelated } from './relevanceCheck';

// Retrieves context from the LlamaIndex/Qdrant store and injects it as a system
// message. Injected into `aiMessages` only (never `conversationHistory`) so the
// context is not persisted to MongoDB and re-injected on later turns. Fails open.
export const injectRagContext = async (
 aiMessages: any[],
 userInput: string,
 ragUserId: string,
 sessionId: string,
 minScore?: number
): Promise<RagChunk[]> => {
 // Ignore out-of-range values from the client rather than failing the turn.
 const cutoff = typeof minScore === 'number' && minScore >= 0 && minScore <= 1 ? minScore : undefined;
 const extraction = await llamaIndexService.extract(userInput, env.RAG_TOP_K, ragUserId, cutoff);
 if (!extraction.success || !extraction.responseObject?.extractedText.trim()) {
  if (extraction.success && cutoff !== undefined) {
   logger.info(`[chatAI] No RAG chunk scored >= ${cutoff} for session ${sessionId}`);
  }
  return [];
 }

 const { extractedText, chunks } = extraction.responseObject;
 const isRelevant = await isRagAnswerRelated(userInput, extractedText);
 if (!isRelevant) {
  logger.info(`[chatAI] RAG context discarded as unrelated to query for session ${sessionId}`);
  return [];
 }

 aiMessages.unshift({
  role: 'system',
  content: buildRagGuardrailPrompt(extractedText),
 });
 const ragSources: RagChunk[] = chunks.map((chunk, index) => ({
  id: `${index}`,
  text: chunk.text,
  score: chunk.score,
  source: typeof chunk.metadata.filename === 'string' ? chunk.metadata.filename : undefined,
 }));
 logger.info(`[chatAI] RAG injected ${ragSources.length} chunk(s) for session ${sessionId}`);
 return ragSources;
};
