import { Schema, model } from 'mongoose';

export interface TokenUsageDoc {
 prompt_tokens?: number;
 completion_tokens?: number;
 total_tokens?: number;
}

export interface AiCallLogDoc {
 callId: string;
 timestamp: Date;
 sessionId?: string;
 provider: string;
 model: string;
 status: 'SUCCESS' | 'FAILED';
 error?: string;
 durationMs: number;
 prompt: string;
 contextSize: number;
 tokenUsage?: TokenUsageDoc;
}

const aiCallLogSchema = new Schema<AiCallLogDoc>(
 {
  callId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  sessionId: String,
  provider: String,
  model: String,
  status: { type: String, enum: ['SUCCESS', 'FAILED'] },
  error: String,
  durationMs: Number,
  prompt: String,
  contextSize: Number,
  tokenUsage: {
   prompt_tokens: Number,
   completion_tokens: Number,
   total_tokens: Number,
  },
 },
 // Capped so the collection keeps only the most recent 500 calls, oldest-evicted-first,
 // mirroring the previous Redis list's lPush + lTrim(0, 499) behavior.
 { capped: { size: 5 * 1024 * 1024, max: 500 }, versionKey: false }
);

export const AiCallLogModel = model<AiCallLogDoc>('AiCallLog', aiCallLogSchema);
