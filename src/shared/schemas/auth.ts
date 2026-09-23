import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const UserRoleSchema = z.enum(['viewer', 'reviewer', 'admin']);

export const UpdateUserRoleSchema = z.object({
  role: UserRoleSchema,
});

export const UpdateUserStatusSchema = z.object({
  is_active: z.boolean(),
});
