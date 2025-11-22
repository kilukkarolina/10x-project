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

/**
 * Zod schema for GET /api/v1/transactions query parameters
 * Validates filtering, search, and pagination parameters
 *
 * Validation rules:
 * - month: Optional, YYYY-MM format (e.g., "2025-01")
 * - type: Optional, enum ["INCOME", "EXPENSE", "ALL"], default: "ALL"
 * - category: Optional, non-empty string (category code)
 * - search: Optional, string for full-text search in notes
 * - cursor: Optional, base64-encoded pagination cursor
 * - limit: Optional, integer 1-100, default: 50
 */
export const GetTransactionsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
    .optional(),

  type: z.enum(["INCOME", "EXPENSE", "ALL"]).default("ALL"),

  category: z.string().min(1).optional(),

  search: z.string().optional(),

  cursor: z.string().optional(),

  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Type inference from GetTransactionsQuerySchema
 */
export type GetTransactionsQuery = z.infer<typeof GetTransactionsQuerySchema>;

/**
 * Decode base64 pagination cursor
 * Format: base64("{occurred_on}_{id}")
 *
 * @param cursor - Base64-encoded cursor string
 * @returns Object with occurred_on (YYYY-MM-DD) and id (UUID)
 * @throws Error - Invalid cursor format, structure, date, or UUID
 */
export function decodeCursor(cursor: string): { occurred_on: string; id: string } {
  try {
    const decoded = atob(cursor);
    const parts = decoded.split("_");

    if (parts.length !== 2) {
      throw new Error("Invalid cursor structure");
    }

    const [occurred_on, id] = parts;

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurred_on)) {
      throw new Error("Invalid date in cursor");
    }

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("Invalid UUID in cursor");
    }

    return { occurred_on, id };
  } catch {
    throw new Error("Invalid cursor format");
  }
}

/**
 * Encode pagination cursor to base64
 * Format: base64("{occurred_on}_{id}")
 *
 * @param occurredOn - Transaction occurred_on date (YYYY-MM-DD)
 * @param id - Transaction UUID
 * @returns Base64-encoded cursor string
 */
export function encodeCursor(occurredOn: string, id: string): string {
  return btoa(`${occurredOn}_${id}`);
}

/**
 * Zod schema for GET /api/v1/transactions/:id path parameters
 * Validates transaction UUID in URL path
 */
export const GetTransactionByIdParamsSchema = z.object({
  id: z.string().uuid("Transaction ID must be a valid UUID"),
});

/**
 * Type inference from schema
 */
export type GetTransactionByIdParams = z.infer<typeof GetTransactionByIdParamsSchema>;

/**
 * Zod schema for UpdateTransactionCommand
 * Validates incoming request data for PATCH /api/v1/transactions/:id
 *
 * Validation rules:
 * - All fields are optional (partial update)
 * - category_code: Non-empty string
 * - amount_cents: Positive integer
 * - occurred_on: YYYY-MM-DD format, not in the future
 * - note: Optional, max 500 chars, no control characters, nullable
 * - At least one field must be provided
 */
export const UpdateTransactionSchema = z
  .object({
    category_code: z.string().min(1, "Category code cannot be empty").optional(),

    amount_cents: z
      .number({
        invalid_type_error: "Amount must be a number",
      })
      .int("Amount must be an integer")
      .positive("Amount must be greater than 0")
      .optional(),

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
      )
      .optional(),

    note: z
      .string()
      .max(500, "Note cannot exceed 500 characters")
      // eslint-disable-next-line no-control-regex
      .regex(/^[^\x00-\x1F\x7F]*$/, {
        message: "Note cannot contain control characters",
      })
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

/**
 * Type inference from Zod schema for use in TypeScript
 */
export type UpdateTransactionSchemaType = z.infer<typeof UpdateTransactionSchema>;

/**
 * Zod schema for PATCH /api/v1/transactions/:id path parameters
 * Validates transaction UUID in URL path
 */
export const UpdateTransactionParamsSchema = z.object({
  id: z.string().uuid("Transaction ID must be a valid UUID"),
});

/**
 * Type inference from schema
 */
export type UpdateTransactionParams = z.infer<typeof UpdateTransactionParamsSchema>;
