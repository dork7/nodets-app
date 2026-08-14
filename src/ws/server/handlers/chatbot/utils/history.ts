import { env } from '@/common/utils/envConfig';
import { openai } from '@/openai';

import { ChatMessage } from '../../chatAI';

export const buildConversationHistory = (
 userInput: string,
 previousHistory: ChatMessage[],
 isRelated: boolean
): ChatMessage[] => {
 const newHistory: ChatMessage[] = [{ role: 'user', content: userInput }];

 if (isRelated && previousHistory.length > 0) {
  newHistory.unshift(...previousHistory);
 }

 return newHistory;
};

export const getSummeriseHistory = async (history: ChatMessage[]): Promise<string> => {
 const summary = await openai.chat.completions.create({
  model: env.LOCALAI_SUMMARY_MODEL as string,
  messages: history.map((m) => ({ role: m.role, content: m.content })),
 });
 return summary.choices[0].message.content as string;
};
