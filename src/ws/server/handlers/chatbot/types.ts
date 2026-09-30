import { TokenUsage } from './utils/usage/tokenUsage';

export interface ChatMessage {
 role: 'user' | 'assistant' | 'system';
 content: string;
}

export interface RagChunk {
 id: string;
 text: string;
 score: number;
 source?: string;
}

export interface WebSocketMessage {
 id: string;
 method?: string;
 type?: string;
 model?: string;
 provider?: string;
 stream?: boolean | string;
 rag?: boolean;
 ragDistance?: number;
 userId?: string;
 params?: {
  prompt?: string;
  imageId?: string;
  imageIds?: string[];
  fileIds?: string[];
 };
}

export interface DeltaToolCall {
 index?: number;
 id?: string;
 function?: unknown;
 type?: string;
}

export interface AIResponseChunk {
 choices?: Array<{
  delta?: {
   content?: string;
   tool_calls?: DeltaToolCall[];
  };
  finish_reason?: string | null;
 }>;
 usage?: TokenUsage;
}

export interface AIResponse {
 choices: Array<{
  message: ChatMessage;
 }>;
 usage?: TokenUsage;
}
