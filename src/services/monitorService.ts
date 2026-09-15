import { LOCALAI_URL } from '@/common/utils/getLocalAILLMs';
import { AiCallLogModel } from '@/models/aiCallLog.model';
import { AiModelStatsModel } from '@/models/aiModelStats.model';
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

const MAX_LOGS = 500;

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
      const callId = Math.random().toString(36).substring(2, 9);
      const timestamp = new Date();
      const contextSize = prompt.length;

      // 1. Append to the detailed logs collection (capped at MAX_LOGS, oldest evicted first)
      await AiCallLogModel.create({
        callId,
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
      });

      // 2. Update aggregated stats per model
      await AiModelStatsModel.findOneAndUpdate(
        { model },
        { $inc: { totalCalls: 1, totalDuration: durationMs }, $set: { lastUpdated: timestamp } },
        { upsert: true }
      );

      logger.info(`[Monitor] Logged AI call for ${model}: ${status}`);
    } catch (err) {
      logger.error('[Monitor] Failed to log AI call', err);
    }
  },

  async getRecentLogs(): Promise<AiCallLog[]> {
    try {
      const logs = await AiCallLogModel.find().sort({ timestamp: -1 }).limit(MAX_LOGS).lean();
      return logs.map((log) => ({
        id: log.callId,
        timestamp: log.timestamp.toISOString(),
        sessionId: log.sessionId,
        provider: log.provider,
        model: log.model,
        status: log.status,
        error: log.error,
        durationMs: log.durationMs,
        prompt: log.prompt,
        contextSize: log.contextSize,
        tokenUsage: log.tokenUsage,
      }));
    } catch (err) {
      logger.error('[Monitor] Failed to fetch logs', err);
      return [];
    }
  },

  async getModelStats(model: string) {
    try {
      const stats = await AiModelStatsModel.findOne({ model }).lean();
      if (!stats) return null;

      return {
        totalCalls: stats.totalCalls,
        totalDuration: stats.totalDuration,
        avgDurationMs: stats.totalCalls > 0 ? stats.totalDuration / stats.totalCalls : 0,
        lastUpdated: stats.lastUpdated.toISOString(),
      };
    } catch (err) {
      logger.error(`[Monitor] Failed to fetch stats for ${model}`, err);
      return null;
    }
  },

  // Persisted per-model call counters (MongoDB-backed, survives restarts) —
  // distinct from getModelMetrics()'s live LocalAI Prometheus snapshot.
  async getAllModelStats() {
    try {
      const stats = await AiModelStatsModel.find().sort({ totalCalls: -1 }).lean();
      return stats.map((s) => ({
        model: s.model,
        totalCalls: s.totalCalls,
        totalDuration: s.totalDuration,
        avgDurationMs: s.totalCalls > 0 ? s.totalDuration / s.totalCalls : 0,
        lastUpdated: s.lastUpdated.toISOString(),
      }));
    } catch (err) {
      logger.error('[Monitor] Failed to fetch all model stats', err);
      return [];
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
      // Not a critical app error — this fires on every dashboard poll (every 5s)
      // whenever LOCALAI_URL points at a provider that doesn't expose LocalAI's
      // /metrics and /system endpoints (e.g. Ollama, which returns 404 for both).
      // logger.error would also spam a Slack notification per the proxy in
      // @/server, so this stays at warn.
      logger.warn(`[Monitor] LocalAI model metrics unavailable: ${(err as Error)?.message ?? err}`);
      return emptyModelMetrics();
    }
  },
};
