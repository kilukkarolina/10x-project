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
  name: z.string().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),

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

/**
 * Zod schema for GET /api/v1/goals query parameters
 * Validates and transforms the include_archived parameter
 *
 * Validation rules:
 * - include_archived: Optional boolean, defaults to false
 * - Accepts: true, false, "true", "false", "1", "0", null, undefined
 * - Rejects: any other string values (e.g., "maybe", "yes")
 */
export const ListGoalsQuerySchema = z.object({
  include_archived: z.preprocess((val) => {
    if (val === null || val === undefined) return false;
    if (typeof val === "boolean") return val;
    if (val === "true" || val === "1") return true;
    if (val === "false" || val === "0") return false;
    return val; // Leave invalid values to be caught by z.boolean()
  }, z.boolean().default(false)),
});
