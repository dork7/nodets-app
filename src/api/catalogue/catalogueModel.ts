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

const commonCatelogueAPIResp = {
 id: z.number(),
 title: z.string(),
 description: z.string(),
 category: z.string(),
 price: z.number(),
 discountPercentage: z.number(),
 rating: z.number(),
 stock: z.number(),
 tags: z.string().array(),
 brand: z.string().optional(),
 sku: z.string(),
 weight: z.number(),
 dimensions: z.object({
  width: z.number(),
  height: z.number(),
  depth: z.number(),
 }),
 warrantyInformation: z.string(),
 shippingInformation: z.string(),
 availabilityStatus: z.string(),
 reviews: z
  .object({
   rating: z.number(),
   comment: z.string(),
   date: z.string(),
   reviewerName: z.string(),
   reviewerEmail: z.string(),
  })
  .array(),

 returnPolicy: z.string(),
 minimumOrderQuantity: z.number(),
 meta: z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  barcode: z.string(),
  qrCode: z.string(),
 }),
 images: z.string().array(),
 thumbnail: z.string(),
};

export const CatelogueAPIRespSchema = z.object(commonCatelogueAPIResp);
export const CatelogueAPIRespSchemaArray = z.object(commonCatelogueAPIResp).array();
