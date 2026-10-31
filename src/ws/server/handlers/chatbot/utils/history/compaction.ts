import { env } from '@/common/utils/envConfig';
import { callAI } from '@/config/openaiConfig';
import { buildHistoryCompactionPrompt, HISTORY_SUMMARY_PREFIX } from '@/config/prompt';
import { logger } from '@/server';

import { ChatMessage } from '../../types';

export interface CompactionResult {
 history: ChatMessage[];
 compacted: boolean;
}

const historySize = (history: ChatMessage[]): number =>
 history.reduce((total, message) => total + (message.content?.length ?? 0), 0);

/**
 * Once the stored history grows past CHAT_HISTORY_COMPACT_THRESHOLD_CHARS, folds every
 * message except the CHAT_HISTORY_KEEP_RECENT most recent into one summary system
 * message, so the history sent to the model (and stored) stays bounded. A previous
 * summary is part of the older messages, so it gets merged into the new one.
 *
 * Uses the chat's own provider/model, since that one is known to be reachable. Fails
 * open: if summarizing fails, the full history is returned unchanged.
 */
export const compactHistory = async (
 history: ChatMessage[],
 options: { provider: string; model: string; signal?: AbortSignal }
): Promise<CompactionResult> => {
 const keepRecent = Math.max(1, env.CHAT_HISTORY_KEEP_RECENT);
 if (history.length <= keepRecent || historySize(history) <= env.CHAT_HISTORY_COMPACT_THRESHOLD_CHARS) {
  return { history, compacted: false };
 }

 const older = history.slice(0, -keepRecent);
 const recent = history.slice(-keepRecent);
 const transcript = older.map((message) => `${message.role}: ${message.content}`).join('\n\n');

 try {
  const completion: any = await callAI(
   options.model,
   [{ role: 'user', content: buildHistoryCompactionPrompt(transcript) }],
   { stream: false, temperature: 0.2, provider: options.provider },
   options.signal
  );

  const summary = completion.choices?.[0]?.message?.content?.trim();
  if (!summary) {
   throw new Error('summarizer returned an empty response');
  }

  logger.info(`[chatAI] Compacted ${older.length} message(s) into a summary (${summary.length} chars)`);
  return {
   history: [{ role: 'system', content: `${HISTORY_SUMMARY_PREFIX}\n${summary}` }, ...recent],
   compacted: true,
  };
 } catch (error) {
  if (options.signal?.aborted) {
   throw error;
  }
  logger.warn(`[chatAI] History compaction failed, keeping full history: ${(error as Error).message}`);
  return { history, compacted: false };
 }
};
