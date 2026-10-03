import { ChatMessage } from '../../types';

export const buildConversationHistory = (userInput: string, previousHistory: ChatMessage[]): ChatMessage[] => [
 ...previousHistory,
 { role: 'user', content: userInput },
];
