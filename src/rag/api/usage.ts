import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';

/** Sums token usage across every model call in one graph run, for the request log. */
export class UsageCollector extends BaseCallbackHandler {
 name = 'rag-usage-collector';
 private inputTokens = 0;
 private outputTokens = 0;

 handleLLMEnd(output: LLMResult) {
  for (const generation of output.generations.flat()) {
   const usage = (generation as { message?: { usage_metadata?: { input_tokens?: number; output_tokens?: number } } })
    .message?.usage_metadata;
   this.inputTokens += usage?.input_tokens ?? 0;
   this.outputTokens += usage?.output_tokens ?? 0;
  }
 }

 totals() {
  return { inputTokens: this.inputTokens, outputTokens: this.outputTokens };
 }
}
