import { z } from "zod";

/**
 * Schema for GET /api/v1/categories query parameters
 * Validates optional 'kind' filter for transaction categories
 */
export const getCategoriesQuerySchema = z.object({
  kind: z
    .enum(["INCOME", "EXPENSE"], {
      errorMap: () => ({ message: "Wartość musi być 'INCOME' lub 'EXPENSE'" }),
    })
    .optional(),
});

export type GetCategoriesQuery = z.infer<typeof getCategoriesQuerySchema>;
