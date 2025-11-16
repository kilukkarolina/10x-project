import { z } from "zod";

/**
 * Zod schema for CreateTransactionCommand
 * Validates incoming request data for POST /api/v1/transactions
 *
 * Validation rules:
 * - type: Must be "INCOME" or "EXPENSE"
 * - category_code: Non-empty string
 * - amount_cents: Positive integer
 * - occurred_on: YYYY-MM-DD format, not in the future
 * - note: Optional, max 500 chars, no control characters
 * - client_request_id: Valid UUID for idempotency
 */
export const CreateTransactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"], {
    errorMap: () => ({ message: "Type must be either INCOME or EXPENSE" }),
  }),

  category_code: z.string().min(1, "Category code is required"),

  amount_cents: z
    .number({
      required_error: "Amount is required",
      invalid_type_error: "Amount must be a number",
    })
    .int("Amount must be an integer")
    .positive("Amount must be greater than 0"),

  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine(
      (date) => {
        const transactionDate = new Date(date);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today
        return transactionDate <= today;
      },
      { message: "Transaction date cannot be in the future" }
    ),

  note: z
    .string()
    .max(500, "Note cannot exceed 500 characters")
    // eslint-disable-next-line no-control-regex
    .regex(/^[^\x00-\x1F\x7F]*$/, {
      message: "Note cannot contain control characters",
    })
    .nullable()
    .optional(),

  client_request_id: z.string().uuid("Client request ID must be a valid UUID"),
});

/**
 * Type inference from Zod schema for use in TypeScript
 */
export type CreateTransactionSchemaType = z.infer<typeof CreateTransactionSchema>;
