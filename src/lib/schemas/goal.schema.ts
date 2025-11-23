import { z } from "zod";

/**
 * Zod schema for CreateGoalCommand
 * Validates incoming request data for POST /api/v1/goals
 *
 * Validation rules:
 * - name: Required, 1-100 characters
 * - type_code: Required, non-empty string
 * - target_amount_cents: Required, positive integer
 * - is_priority: Optional boolean, defaults to false
 */
export const CreateGoalSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name cannot exceed 100 characters"),

  type_code: z.string().min(1, "Goal type code is required"),

  target_amount_cents: z
    .number({
      required_error: "Target amount is required",
      invalid_type_error: "Target amount must be a number",
    })
    .int("Target amount must be an integer")
    .positive("Target amount must be greater than 0"),

  is_priority: z.boolean().optional().default(false),
});

