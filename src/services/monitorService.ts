import { LOCALAI_URL } from '@/common/utils/getLocalAILLMs';
import { redisClient } from '@/config/redisStore';
import { logger } from '@/server';

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ModelMetric {
  model: string;
  loaded: boolean;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelMetricsSnapshot {
  reachable: boolean;
  loadedCount: number;
  loadedModels: string[];
  backends: string[];
  process: { residentMemoryBytes: number; cpuSeconds: number; uptimeSeconds: number };
  totals: { requests: number; promptTokens: number; completionTokens: number; totalTokens: number; unrecorded: number };
  models: ModelMetric[];
}

interface PromSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const parsePromSample = (line: string): PromSample | null => {
  const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(.+)$/);
  if (!match) return null;

  const [, name, rawLabels, rawValue] = match;
  const labels: Record<string, string> = {};
  if (rawLabels) {
    for (const pair of rawLabels.matchAll(/([a-zA-Z0-9_]+)="((?:[^"\\]|\\.)*)"/g)) {
      labels[pair[1]] = pair[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  return { name, labels, value: Number(rawValue) };
};

const fetchLocalAIText = async (path: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${LOCALAI_URL}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`LocalAI ${path} returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
};

const emptyModelMetrics = (): ModelMetricsSnapshot => ({
  reachable: false,
  loadedCount: 0,
  loadedModels: [],
  backends: [],
  process: { residentMemoryBytes: 0, cpuSeconds: 0, uptimeSeconds: 0 },
  totals: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, unrecorded: 0 },
  models: [],
});

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
  },

  // Pulls per-model observability straight from the LocalAI Prometheus endpoint
  // (`${LOCALAI_URL}/metrics`) plus `/system` for which models are resident in RAM.
  async getModelMetrics(): Promise<ModelMetricsSnapshot> {
    try {
      const [metricsText, systemText] = await Promise.all([
        fetchLocalAIText('/metrics'),
        fetchLocalAIText('/system').catch(() => '{}'),
      ]);

      const system = JSON.parse(systemText || '{}');
      const loadedModels: string[] = (system.loaded_models || [])
        .map((m: { id?: string }) => m.id)
        .filter(Boolean);
      const loadedSet = new Set(loadedModels);

      const models = new Map<string, ModelMetric>();
      const ensure = (name: string): ModelMetric => {
        let entry = models.get(name);
        if (!entry) {
          entry = {
            model: name,
            loaded: loadedSet.has(name),
            requests: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          };
          models.set(name, entry);
        }
        return entry;
      };
      loadedModels.forEach(ensure);

      const process = { residentMemoryBytes: 0, cpuSeconds: 0, uptimeSeconds: 0 };
      let startTimeSeconds = 0;
      let unrecorded = 0;

      for (const rawLine of metricsText.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const sample = parsePromSample(line);
        if (!sample || Number.isNaN(sample.value)) continue;

        const servedModel = sample.labels.served_model;
        switch (sample.name) {
          case 'localai_billed_requests_total':
            if (servedModel) ensure(servedModel).requests += sample.value;
            break;
          case 'localai_tokens_total':
            if (servedModel) {
              const entry = ensure(servedModel);
              if (sample.labels.kind === 'prompt') entry.promptTokens += sample.value;
              else if (sample.labels.kind === 'completion') entry.completionTokens += sample.value;
            }
            break;
          case 'localai_usage_unrecorded_total':
            unrecorded += sample.value;
            break;
          case 'process_resident_memory_bytes':
            process.residentMemoryBytes = sample.value;
            break;
          case 'process_cpu_seconds_total':
            process.cpuSeconds = sample.value;
            break;
          case 'process_start_time_seconds':
            startTimeSeconds = sample.value;
            break;
        }
      }

      if (startTimeSeconds) {
        process.uptimeSeconds = Math.max(0, Math.round(Date.now() / 1000 - startTimeSeconds));
      }

      const modelList = [...models.values()]
        .map((entry) => ({ ...entry, totalTokens: entry.promptTokens + entry.completionTokens }))
        .sort((a, b) => Number(b.loaded) - Number(a.loaded) || b.requests - a.requests);

      const totals = modelList.reduce(
        (acc, entry) => ({
          requests: acc.requests + entry.requests,
          promptTokens: acc.promptTokens + entry.promptTokens,
          completionTokens: acc.completionTokens + entry.completionTokens,
          totalTokens: acc.totalTokens + entry.totalTokens,
          unrecorded: acc.unrecorded,
        }),
        { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, unrecorded }
      );

      return {
        reachable: true,
        loadedCount: loadedModels.length,
        loadedModels,
        backends: Array.isArray(system.backends) ? system.backends : [],
        process,
        totals,
        models: modelList,
      };
    } catch (err) {
      logger.error('[Monitor] Failed to fetch LocalAI model metrics', err);
      return emptyModelMetrics();
    }
  },
};
