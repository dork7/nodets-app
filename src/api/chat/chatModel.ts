import { z } from 'zod';

export const ChatRole = z.enum(['system', 'user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRole>;

export const ChatMessageSchema = z.object({
 role: ChatRole,
 content: z.string().min(1),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
 body: z
  .object({
   messages: z.array(ChatMessageSchema).min(1).optional(),
   prompt: z.string().min(1).optional(),
   provider: z.string().optional(),
   model: z.string().optional(),
   temperature: z.number().min(0).max(2).optional(),
  })
  .refine((data) => Boolean(data.messages?.length) || Boolean(data.prompt), {
   message: 'Provide either "messages" or "prompt".',
  }),
});

export const ChatUsageSchema = z.object({
 prompt_tokens: z.number().optional(),
 completion_tokens: z.number().optional(),
 total_tokens: z.number().optional(),
});

export const ChatResponseSchema = z.object({
 reply: z.string(),
 reasoning: z.string().optional(),
 model: z.string(),
 provider: z.string(),
 usage: ChatUsageSchema.optional(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export interface ChatCompletionMessage {
 role?: string;
 content?: string | null;
 reasoning?: string | null;
}
