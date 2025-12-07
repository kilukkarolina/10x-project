import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseAdmin } from "@/db/supabase.admin";
import { ResetPasswordRequestSchema } from "@/lib/schemas/auth";
import { RateLimitService } from "@/lib/services/rate-limit.service";
import type { ErrorResponseDTO } from "@/types";

// Disable static rendering for API endpoint
export const prerender = false;

/**
 * Formats Zod validation errors into a flat object
 * Converts error.errors array into key-value pairs for API response
 *
 * @param error - ZodError instance from failed validation
 * @returns Record<string, string> - Flat object with field paths as keys
 */
function formatZodErrors(error: z.ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join(".");
    formatted[path] = err.message;
  });
  return formatted;
}

/**
 * POST /api/v1/auth/reset-password
 *
 * Initiates password reset flow by sending a reset link via email.
 *
 * Rate Limiting:
 * - 3 attempts per 30 minutes per user
 * - Enforced only if user_id can be resolved from email
 * - Returns 429 with retry_after_seconds if limit exceeded
 *
 * Security:
 * - Always returns neutral response (doesn't reveal account existence)
 * - Uses service role to access Supabase Admin API
 * - Email is normalized (trim + lowercase) before processing
 * - Reset links are valid for 30 minutes (Supabase default)
 * - Links are one-time use (invalidated after use)
 *
 * Request body:
 * {
 *   email: string (valid email format, max 254 chars)
 * }
 *
 * Success Response: 204 No Content
 * - No body returned
 * - Neutral response regardless of account existence
 *
 * Error Responses:
 * - 400 Bad Request: Invalid email format
 *   {
 *     error: "Bad Request",
 *     message: "Invalid request body",
 *     details: { email: "Nieprawidłowy format adresu e-mail" }
 *   }
 *
 * - 429 Too Many Requests: Rate limit exceeded
 *   {
 *     error: "Too Many Requests",
 *     message: "Przekroczono limit prób. Spróbuj ponownie później.",
 *     retry_after_seconds: 1234
 *   }
 *
 * - 500 Internal Server Error: Unexpected error
 *   {
 *     error: "Internal Server Error",
 *     message: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później."
 *   }
 */
export async function POST(context: APIContext): Promise<Response> {
  try {
    // Step 1: Parse and validate request body
    const body = await context.request.json();

    let validatedData;
    try {
      validatedData = ResetPasswordRequestSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorResponse: ErrorResponseDTO = {
          error: "Bad Request",
          message: "Invalid request body",
          details: formatZodErrors(error),
        };

        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw error;
    }

    // Step 2: Normalize email
    const normalizedEmail = validatedData.email.trim().toLowerCase();

    // Step 3: Resolve user_id by email
    const userId = await RateLimitService.getUserIdByEmail(supabaseAdmin, normalizedEmail);

    // Step 4: Check rate limit (only if user exists)
    if (userId) {
      const rateLimitResult = await RateLimitService.checkAndRecord(supabaseAdmin, userId, "reset_password");

      if (!rateLimitResult.allowed) {
        const errorResponse: ErrorResponseDTO = {
          error: "Too Many Requests",
          message: "Przekroczono limit prób. Spróbuj ponownie później.",
          retry_after_seconds: rateLimitResult.retry_after_seconds,
        };

        return new Response(JSON.stringify(errorResponse), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Step 5: Send password reset email using Supabase
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${new URL(context.request.url).origin}/auth/update-password`,
      });

      if (resetError) {
        // Log error but still return neutral response
        // eslint-disable-next-line no-console
        console.error("[ResetPassword] Error sending reset email:", {
          error: resetError.message,
          email_masked: normalizedEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
        });
      }
    }

    // Step 6: Always return neutral success response (204 No Content)
    // Don't reveal whether account exists or email was actually sent
    return new Response(null, { status: 204 });
  } catch (error) {
    // Step 7: Handle unexpected errors
    // eslint-disable-next-line no-console
    console.error("[ResetPassword] Unexpected error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorResponse: ErrorResponseDTO = {
      error: "Internal Server Error",
      message: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}


