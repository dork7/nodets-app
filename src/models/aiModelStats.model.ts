import { Schema, model } from 'mongoose';

export interface AiModelStatsDoc {
 model: string;
 totalCalls: number;
 totalDuration: number;
 lastUpdated: Date;
}

const aiModelStatsSchema = new Schema<AiModelStatsDoc>({
 model: { type: String, required: true, unique: true },
 totalCalls: { type: Number, default: 0 },
 totalDuration: { type: Number, default: 0 },
 lastUpdated: { type: Date, default: Date.now },
});

// Mirrors the 1-hour TTL the previous Redis hash used (reset on every update).
aiModelStatsSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 3600 });

export const AiModelStatsModel = model<AiModelStatsDoc>('AiModelStats', aiModelStatsSchema);
