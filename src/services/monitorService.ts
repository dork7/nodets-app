import { redisClient } from '@/config/redisStore';
import { logger } from '@/server';

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface AiCallLog {
  id: string;
  timestamp: string;
  sessionId?: string;
  provider: string;
  model: string;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
  durationMs: number;
  prompt: string;
  contextSize: number;
  tokenUsage?: TokenUsage;
}

const LOG_KEY = 'ai_logs_list';
const STATS_KEY_PREFIX = 'ai_stats_model:';
const MAX_LOGS = 500;
const TTL_SECONDS = 3600; // 60 minutes

export const monitorService = {
  async logCall(
    provider: string,
    model: string,
    status: 'SUCCESS' | 'FAILED',
    durationMs: number,
    prompt: string,
    error?: string,
    sessionId?: string,
    tokenUsage?: TokenUsage
  ) {
    try {
      const id = Math.random().toString(36).substring(2, 9);
      const timestamp = new Date().toISOString();
      const contextSize = prompt.length;

      const log: AiCallLog = {
        id,
        timestamp,
        sessionId,
        provider,
        model,
        status,
        error,
        durationMs,
        prompt,
        contextSize,
        tokenUsage,
      };

      // 1. Append to the detailed logs list
      await redisClient.lPush(LOG_KEY, JSON.stringify(log));
      await redisClient.lTrim(LOG_KEY, 0, MAX_LOGS - 1);
      await redisClient.expire(LOG_KEY, TTL_SECONDS);

      // 2. Update aggregated stats in a Redis Hash per model
      const statsKey = `${STATS_KEY_PREFIX}${model}`;
      const currentStatsJson = await redisClient.hGet(statsKey, 'data');

      const stats: { totalCalls: number; totalDuration: number } = currentStatsJson
        ? JSON.parse(currentStatsJson)
        : { totalCalls: 0, totalDuration: 0 };

      stats.totalCalls += 1;
      stats.totalDuration += durationMs;

      const avgDuration = stats.totalDuration / stats.totalCalls;

      await redisClient.hSet(statsKey, 'data', JSON.stringify({
        totalCalls: stats.totalCalls,
        totalDuration: stats.totalDuration,
        avgDurationMs: avgDuration,
        lastUpdated: timestamp
      }));
      await redisClient.expire(statsKey, TTL_SECONDS);

      logger.info(`[Monitor] Logged AI call for ${model}: ${status}`);
    } catch (err) {
      logger.error('[Monitor] Failed to log AI call', err);
    }
  },

  async getRecentLogs(): Promise<AiCallLog[]> {
    try {
      const logs = await redisClient.lRange(LOG_KEY, 0, -1);
      return logs.map((log: string) => JSON.parse(log) as AiCallLog);
    } catch (err) {
      logger.error('[Monitor] Failed to fetch logs', err);
      return [];
    }
  },

  async getModelStats(model: string) {
    try {
      const statsJson = await redisClient.hGet(`${STATS_KEY_PREFIX}${model}`, 'data');
      return statsJson ? JSON.parse(statsJson) : null;
    } catch (err) {
      logger.error(`[Monitor] Failed to fetch stats for ${model}`, err);
      return null;
    }
  }
};
