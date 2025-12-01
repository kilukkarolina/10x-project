import { z } from "zod";

/**
 * Schemat walidacji adresu e-mail
 * RFC 5322, max 254 znaki
 */
export const EmailSchema = z
  .string()
  .min(1, "Adres e-mail jest wymagany")
  .email("Nieprawidłowy format adresu e-mail")
  .max(254, "Adres e-mail jest za długi");

/**
 * Schemat walidacji hasła
 * - Minimum 10 znaków
 * - Co najmniej jedna litera
 * - Co najmniej jedna cyfra
 */
export const PasswordSchema = z
  .string()
  .min(10, "Hasło musi mieć minimum 10 znaków")
  .regex(/[A-Za-z]/, "Hasło musi zawierać co najmniej jedną literę")
  .regex(/[0-9]/, "Hasło musi zawierać co najmniej jedną cyfrę");

/**
 * Schemat dla żądania resetu hasła
 */
export const ResetPasswordRequestSchema = z.object({
  email: EmailSchema,
});

/**
 * Schemat dla ustawienia nowego hasła po resecie
 */
export const UpdatePasswordSchema = z
  .object({
    password: PasswordSchema,
    confirmPassword: z.string().min(1, "Potwierdzenie hasła jest wymagane"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Hasła muszą być identyczne",
    path: ["confirmPassword"],
  });

/**
 * Schemat dla rejestracji
 */
export const RegisterSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    confirmPassword: z.string().min(1, "Potwierdzenie hasła jest wymagane"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Hasła muszą być identyczne",
    path: ["confirmPassword"],
  });

/**
 * Schemat dla logowania
 */
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Hasło jest wymagane"),
});

/**
 * Schemat dla ponownej wysyłki weryfikacji
 */
export const ResendVerificationRequestSchema = z.object({
  email: EmailSchema,
});
