import { z } from "zod";

/**
 * Email schema - zgodny z RFC 5322
 * Max length 254 zgodnie ze standardem
 */
export const EmailSchema = z
  .string()
  .email("Nieprawidłowy format adresu e-mail")
  .max(254, "Adres e-mail jest za długi");

/**
 * Password schema - polityka haseł FinFlow
 * - Minimum 10 znaków
 * - Co najmniej 1 litera (A-Z lub a-z)
 * - Co najmniej 1 cyfra (0-9)
 */
export const PasswordSchema = z
  .string()
  .min(10, "Hasło musi zawierać minimum 10 znaków")
  .regex(/[A-Za-z]/, "Hasło musi zawierać co najmniej jedną literę")
  .regex(/[0-9]/, "Hasło musi zawierać co najmniej jedną cyfrę");

/**
 * Login request schema
 */
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Hasło jest wymagane"),
});

/**
 * Reset password request schema
 */
export const ResetPasswordRequestSchema = z.object({
  email: EmailSchema,
});

/**
 * Update password schema
 */
export const UpdatePasswordSchema = z.object({
  password: PasswordSchema,
});

/**
 * Register request schema
 */
export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

// Export types for TypeScript
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type UpdatePasswordRequest = z.infer<typeof UpdatePasswordSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
