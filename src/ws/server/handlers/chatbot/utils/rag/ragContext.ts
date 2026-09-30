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
 sessionId: string
): Promise<RagChunk[]> => {
 const extraction = await llamaIndexService.extract(userInput, env.RAG_TOP_K, ragUserId);
 if (!extraction.success || !extraction.responseObject?.extractedText.trim()) {
  return [];
 }

 const { extractedText, sources } = extraction.responseObject;
 const isRelevant = await isRagAnswerRelated(userInput, extractedText);
 if (!isRelevant) {
  logger.info(`[chatAI] RAG context discarded as unrelated to query for session ${sessionId}`);
  return [];
 }

 aiMessages.unshift({
  role: 'system',
  content: buildRagGuardrailPrompt(extractedText),
 });
 const ragSources: RagChunk[] = sources.map((meta, index) => ({
  id: `${index}`,
  text: extractedText,
  score: 0,
  source: typeof meta.filename === 'string' ? meta.filename : undefined,
 }));
 logger.info(`[chatAI] RAG injected ${ragSources.length} chunk(s) for session ${sessionId}`);
 return ragSources;
};
