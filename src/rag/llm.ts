import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';

import { config } from '@/rag/config';
import { HttpError } from '@/rag/graphUtils';

type Role = 'answer' | 'verifier' | 'vision' | 'utility';

export class ModelStopError extends Error {
 constructor(
  role: Role,
  public stopReason: string | undefined
 ) {
  super(`Model call for "${role}" ended with stop_reason=${stopReason ?? 'unparsed'}`);
  this.name = 'ModelStopError';
 }
}

export function getLlm(role: Role) {
 if (!config.anthropicApiKey) {
  throw new HttpError(503, 'llm_not_configured', 'ANTHROPIC_API_KEY is not set, so the RAG agents cannot run.');
 }
 // No temperature/topP/topK: the current Claude models reject non-default sampling parameters.
 return new ChatAnthropic({
  apiKey: config.anthropicApiKey,
  model: config.models[role],
  maxTokens: 16000,
  // LangChain's default of 6 retries multiplies the cost of every failing call.
  maxRetries: 2,
  // The verifier is the correctness check, so it gets more effort than the model default.
  ...(role === 'verifier' ? { outputConfig: { effort: 'high' as const } } : {}),
 });
}

/** One place that applies the model constraints and turns a bad stop into an error. */
export async function invokeStructured<T extends z.ZodTypeAny>(
 role: Role,
 schema: T,
 messages: BaseMessage[],
 runConfig?: RunnableConfig
): Promise<z.infer<T>> {
 // `jsonSchema` rather than LangChain's default forced tool call, which these models reject.
 const llm = getLlm(role).withStructuredOutput(schema, { method: 'jsonSchema', includeRaw: true });
 const { raw } = await llm.invoke(messages, runConfig);
 const stop = (raw.response_metadata as { stop_reason?: string } | undefined)?.stop_reason;
 if (stop === 'refusal' || stop === 'max_tokens') throw new ModelStopError(role, stop);
 // LangChain's own parser looks for a ```json fence anywhere in the text, so a response whose
 // *string values* contain one (a quoted snippet, a PDF page showing JSON) fails to parse.
 // The response body is the JSON document itself; parse it directly.
 try {
  return schema.parse(JSON.parse(raw.text));
 } catch {
  throw new ModelStopError(role, stop);
 }
}
