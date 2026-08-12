import { z } from 'zod';

export const ImageDetailsSchema = z.object({
 details: z.any(),
 rawText: z.string().optional(),
 reasoning: z.string().optional(),
});

export type ImageDetails = z.infer<typeof ImageDetailsSchema>;

export const ImageAnalysisResponseSchema = z.object({
 details: z.any(),
 rawText: z.string(),
 reasoning: z.string().optional(),
});

export type ImageAnalysisResponse = z.infer<typeof ImageAnalysisResponseSchema>;

export interface ImageAnalysisMessage {
 role?: string;
 content?: string | null;
 reasoning?: string | null;
}
