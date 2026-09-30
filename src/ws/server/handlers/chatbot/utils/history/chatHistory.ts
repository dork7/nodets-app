import { ChatHistoryModel } from '@/models/chatHistory.model';
import { logger } from '@/server';

import { ChatMessage } from '../../types';

export const getChatHistory = async (userId: string): Promise<ChatMessage[]> => {
 try {
  const doc = await ChatHistoryModel.findOne({ userId }).lean();
  return doc?.history ?? [];
 } catch (error) {
  logger.error(`Error retrieving chat history for user ${userId}: ${error}`);
  return [];
 }
};

export const saveChatHistory = async (userId: string, history: ChatMessage[]): Promise<void> => {
 try {
  await ChatHistoryModel.findOneAndUpdate({ userId }, { history, updatedAt: new Date() }, { upsert: true });
 } catch (error) {
  logger.error(`Error saving chat history for user ${userId}: ${error}`);
 }
};

export const getPreviousMessageContent = (history: ChatMessage[]): string => {
 return history.length > 0 ? history[history.length - 1].content : '';
};
