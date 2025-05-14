import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export type User = z.infer<typeof UserSchema>;

export const UserSchema = z.object({
 name: z.string(),
 email: z.string().email(),
 age: z.number(),
 hobbies: z.array(z.string()),
 createdAt: z.date(),
 updatedAt: z.date(),
 orderCount: z.number().optional(),
 orderHistory: z
  .array(
   z.object({
    orderId: z.string(),
    orderRef: z.string(),
   })
  )
  .optional(),
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
 params: z.object({ id: z.string() }),
});
