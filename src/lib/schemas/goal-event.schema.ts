// src/lib/schemas/goal-event.schema.ts

import { z } from "zod";

/**
 * Zod schema for CreateGoalEventCommand
 * Validates incoming request data for POST /api/v1/goal-events
 *
 * Validation rules:
 * - goal_id: Required, valid UUID format
 * - type: Required, must be DEPOSIT or WITHDRAW
 * - amount_cents: Required, positive integer
 * - occurred_on: Required, valid date format YYYY-MM-DD (business rule <= current_date checked in service)
 * - client_request_id: Required, non-empty string for idempotency
 */
export const CreateGoalEventSchema = z.object({
  goal_id: z.string({ required_error: "Goal ID is required" }).uuid("Goal ID must be a valid UUID"),

  type: z.enum(["DEPOSIT", "WITHDRAW"], {
    required_error: "Type is required",
    invalid_type_error: "Type must be DEPOSIT or WITHDRAW",
  }),

  amount_cents: z
    .number({
      required_error: "Amount is required",
      invalid_type_error: "Amount must be a number",
    })
    .int("Amount must be an integer")
    .positive("Amount must be greater than 0"),

  occurred_on: z
    .string({ required_error: "Occurred date is required" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Occurred date must be in YYYY-MM-DD format")
    .refine(
      (date) => {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime());
      },
      { message: "Occurred date must be a valid date" }
    ),

  client_request_id: z
    .string({ required_error: "Client request ID is required" })
    .min(1, "Client request ID cannot be empty"),
});
