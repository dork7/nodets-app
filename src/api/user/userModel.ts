import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { commonValidations } from '@/common/utils/commonValidation';

extendZodWithOpenApi(z);

export type User = z.infer<typeof UserSchema>;

export const UserSchema = z.object({
 id: z.number(),
 name: z.string(),
 email: z.string().email(),
 age: z.number(),
 hobbies: z.array(z.string()),
 createdAt: z.date(),
 updatedAt: z.date(),
});

export const AddUserSchema = z.object({
 body: z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  age: z.number(),
 }),
});

// Input Validation for 'GET users/:id' endpoint
export const GetUserSchema = z.object({
 params: z.object({ id: z.string() }),
});

// Input Validation for 'GET users/:id' endpoint
export const DeleteUserSchema = z.object({
 params: z.object({ id: commonValidations.id }),
});
