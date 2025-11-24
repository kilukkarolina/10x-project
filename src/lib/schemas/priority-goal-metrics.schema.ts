import { z } from "zod";

/**
 * Validation schema for priority goal metrics query parameters
 * Validates optional month parameter in YYYY-MM format
 *
 * Validation rules:
 * - month: Optional string in YYYY-MM format
 * - Format: YYYY-MM where YYYY is 4 digits and MM is 01-12
 * - Month must be between 01 and 12
 * - If not provided, defaults to current month (handled in route)
 */
export const PriorityGoalMetricsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Invalid month format. Expected YYYY-MM")
    .refine(
      (val) => {
        const monthPart = parseInt(val.split("-")[1], 10);
        return monthPart >= 1 && monthPart <= 12;
      },
      { message: "Invalid month format. Expected YYYY-MM" }
    )
    .optional(),
});

export type PriorityGoalMetricsQuery = z.infer<typeof PriorityGoalMetricsQuerySchema>;
