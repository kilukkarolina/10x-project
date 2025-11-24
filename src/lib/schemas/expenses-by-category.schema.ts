import { z } from "zod";

/**
 * Query parameters schema for GET /api/v1/metrics/expenses-by-category
 * Validates month parameter in YYYY-MM format
 *
 * Validation rules:
 * - month: Required string in YYYY-MM format (e.g., "2025-01")
 * - Month must be between 01 and 12
 * - Month cannot be in the future
 */
export const GetExpensesByCategoryQuerySchema = z.object({
  month: z
    .string({ required_error: "Month parameter is required" })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
      message: "Month must be in YYYY-MM format (e.g., 2025-01)",
    })
    .refine(
      (val) => {
        // Check if month is not in the future
        const [year, month] = val.split("-").map(Number);
        const inputDate = new Date(year, month - 1, 1);
        const now = new Date();
        const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return inputDate <= currentMonth;
      },
      {
        message: "Month cannot be in the future",
      }
    ),
});

/**
 * Type inference from GetExpensesByCategoryQuerySchema
 */
export type GetExpensesByCategoryQuery = z.infer<typeof GetExpensesByCategoryQuerySchema>;
