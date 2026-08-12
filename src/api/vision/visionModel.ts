import { z } from 'zod';

export const FoodItemSchema = z.object({
 food_item: z.string(),
 estimated_quantity: z.string().optional(),
 calories: z.number().optional(),
 protein_g: z.number().optional(),
 fat_g: z.number().optional(),
 carbohydrates_g: z.number().optional(),
 fiber_g: z.number().optional(),
});

export type FoodItem = z.infer<typeof FoodItemSchema>;

export const DishTotalEstimateSchema = z.object({
 total_dish_estimate: z.string().optional(),
 total_calories: z.number().optional(),
 total_protein_g: z.number().optional(),
 total_fat_g: z.number().optional(),
 total_carbs_g: z.number().optional(),
});

export type DishTotalEstimate = z.infer<typeof DishTotalEstimateSchema>;

export const ParsedImageDetailsSchema = z.array(z.union([FoodItemSchema, DishTotalEstimateSchema]));
export type ParsedImageDetails = z.infer<typeof ParsedImageDetailsSchema>;

export const ImageDetailsSchema = z.object({
 details: z.union([ParsedImageDetailsSchema, z.string()]),
 rawText: z.string().optional(),
 reasoning: z.string().optional(),
});

export type ImageDetails = z.infer<typeof ImageDetailsSchema>;

export const ImageAnalysisResponseSchema = z.object({
 details: z.union([ParsedImageDetailsSchema, z.string()]),
 rawText: z.string(),
 reasoning: z.string().optional(),
});

export type ImageAnalysisResponse = z.infer<typeof ImageAnalysisResponseSchema>;

export interface ImageAnalysisMessage {
 role?: string;
 content?: string | null;
 reasoning?: string | null;
}