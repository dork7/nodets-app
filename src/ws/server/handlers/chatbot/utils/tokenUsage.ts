import { logger } from '@/server';
import { redis } from '@/services/redisStore';

const TOKEN_USAGE_KEY_PREFIX = 'token_usage_';



export interface TokenUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
   }

export const getTokenUsageKey = (userId: string): string => `${TOKEN_USAGE_KEY_PREFIX}${userId}`;

export const getTokenUsage = async (userId: string): Promise<TokenUsage> => {
 try {
  const usage = await redis.getValue(getTokenUsageKey(userId));
  if (usage && typeof usage === 'object' && 'prompt_tokens' in usage) {
   return usage as TokenUsage;
  }
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
 } catch (error) {
  logger.error(`Error retrieving token usage for user ${userId}: ${error}`);
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
 }
};

export const saveTokenUsage = async (userId: string, usage: TokenUsage): Promise<void> => {
 try {
  const currentUsage = await getTokenUsage(userId);
  const updatedUsage: TokenUsage = {
   prompt_tokens: (currentUsage.prompt_tokens || 0) + (usage.prompt_tokens || 0),
   completion_tokens: (currentUsage.completion_tokens || 0) + (usage.completion_tokens || 0),
   total_tokens: (currentUsage.total_tokens || 0) + (usage.total_tokens || 0),
  };
  await redis.setValue(getTokenUsageKey(userId), updatedUsage, 60 * 60 * 60);
 } catch (error) {
  logger.error(`Error saving token usage for user ${userId}: ${error}`);
 }
};
