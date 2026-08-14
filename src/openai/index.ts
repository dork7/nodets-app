import { localAIInstance } from "./localAI";
import { OpenAITool } from "./tools";

export async function callAI(
    model: string,
    messages: any[],
    options? : {
        stream?: boolean,
        tools?: OpenAITool[],
        temperature?: number,
        max_tokens?: number,
    },
    signal?: AbortSignal,
    
) {
 const completion = await localAIInstance.chat.completions.create(
  {
   model, // or any model listed on OpenRouter
   messages,
   // Ask the server to include usage in the final streaming chunk so token
   // counts are available to the WebSocket client.
   ...(options?.stream ? { stream_options: { include_usage: true } } : {}),
   ...(options ? options : {}),
  },
  { signal }
 );
 return completion;
}