import { Schema, model } from 'mongoose';

export interface ChatMessageDoc {
 role: 'user' | 'assistant' | 'system';
 content: string;
}

export interface ChatHistoryDoc {
 userId: string;
 history: ChatMessageDoc[];
 updatedAt: Date;
}

const chatMessageSchema = new Schema<ChatMessageDoc>({ role: String, content: String }, { _id: false });

const chatHistorySchema = new Schema<ChatHistoryDoc>({
 userId: { type: String, required: true, unique: true },
 history: { type: [chatMessageSchema], default: [] },
 updatedAt: { type: Date, default: Date.now },
});

// Mirrors the 1-hour TTL the previous Redis-backed history used.
chatHistorySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3600 });

export const ChatHistoryModel = model<ChatHistoryDoc>('ChatHistory', chatHistorySchema);
