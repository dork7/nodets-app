import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { commonValidations } from '@/common/utils/commonValidation';

extendZodWithOpenApi(z);

export type Catalogue = z.infer<typeof CatalogueSchema>;

const common = {
 id: z.number(),
 name: z.string(),
 category: z.string().optional(),
 stock: z.number().optional(),
 price: z.number().optional(),
 description: z.string().optional(),
};

export const CatalogueSchema = z.object({
 ...common,
 createdAt: z.date(),
 updatedAt: z.date(),
});

export const AddCatalogueSchema = z.object({
 body: z.object({
  ...common,
 }),
});

// Input Validation for 'GET users/:id' endpoint
export const GetCatalogueSchema = z.object({
 params: z.object({ id: commonValidations.id }),
});

// Input Validation for 'GET users/:id' endpoint
export const DeleteCatalogueSchema = z.object({
 params: z.object({ id: commonValidations.id }),
});
