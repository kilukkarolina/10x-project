import type { APIRoute } from "astro";
import { getCategoriesQuerySchema } from "@/lib/schemas/transaction-category.schema";
import { getActiveCategories } from "@/lib/services/transaction-category.service";
import type { TransactionCategoryListResponseDTO, ErrorResponseDTO } from "@/types";

// Disable prerendering for API routes
export const prerender = false;

/**
 * GET /api/v1/categories
 * List all active transaction categories with optional kind filter
 *
 * Note: Authentication is temporarily disabled for development.
 * Auth will be implemented comprehensively in a future iteration.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Parse and validate query parameters
    const url = new URL(request.url);
    const queryParams = {
      kind: url.searchParams.get("kind") ?? undefined,
    };

    const validation = getCategoriesQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      const errorResponse: ErrorResponseDTO = {
        error: "validation_error",
        message: "Nieprawidłowe parametry zapytania",
        details: validation.error.flatten().fieldErrors as Record<string, string>,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Fetch categories from service
    const { kind } = validation.data;
    const categories = await getActiveCategories(locals.supabase, kind);

    // 3. Build and return success response
    const response: TransactionCategoryListResponseDTO = {
      data: categories,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    // 4. Handle unexpected errors
    console.error("[GET /api/v1/categories] Unexpected error:", error);

    const errorResponse: ErrorResponseDTO = {
      error: "internal_error",
      message: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
