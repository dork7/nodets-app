import { z } from 'zod';

export const ImageDetailsSchema = z.object({
 details: z.string(),
 rawText: z.string().optional(),
});

export type ImageDetails = z.infer<typeof ImageDetailsSchema>;

