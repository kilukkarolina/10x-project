// tests/unit/lib/schemas/transaction.schema.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  GetTransactionsQuerySchema,
} from "@/lib/schemas/transaction.schema";

describe("CreateTransactionSchema", () => {
  const validData = {
    type: "EXPENSE" as const,
    category_code: "FOOD_GROCERIES",
    amount_cents: 12345,
    occurred_on: "2025-12-01",
    note: "Test transaction",
    client_request_id: "123e4567-e89b-12d3-a456-426614174000",
  };

  describe("valid data", () => {
    it("accepts complete valid data", () => {
      const result = CreateTransactionSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("accepts INCOME as type", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        type: "INCOME",
      });
      expect(result.success).toBe(true);
    });

    it("accepts EXPENSE as type", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        type: "EXPENSE",
      });
      expect(result.success).toBe(true);
    });

    it("accepts note as null", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        note: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts note as undefined (optional)", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { note, ...dataWithoutNote } = validData;
      const result = CreateTransactionSchema.safeParse(dataWithoutNote);
      expect(result.success).toBe(true);
    });

    it("accepts long note (up to 500 characters)", () => {
      const longNote = "a".repeat(500);
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        note: longNote,
      });
      expect(result.success).toBe(true);
    });

    it("accepts today's date", () => {
      const today = new Date().toISOString().split("T")[0];
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        occurred_on: today,
      });
      expect(result.success).toBe(true);
    });

    it("accepts date from the past", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        occurred_on: "2020-01-01",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("type validation", () => {
    it("rejects invalid type", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        type: "INVALID",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Type must be either INCOME or EXPENSE");
      }
    });

    it("rejects missing type", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { type, ...dataWithoutType } = validData;
      const result = CreateTransactionSchema.safeParse(dataWithoutType);
      expect(result.success).toBe(false);
    });
  });

  describe("category_code validation", () => {
    it("rejects empty string", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        category_code: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing category_code", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { category_code, ...dataWithoutCategory } = validData;
      const result = CreateTransactionSchema.safeParse(dataWithoutCategory);
      expect(result.success).toBe(false);
    });

    it("accepts various category codes", () => {
      const codes = ["INCOME_SALARY", "EXPENSE_RENT", "FOOD_RESTAURANTS"];
      codes.forEach((code) => {
        const result = CreateTransactionSchema.safeParse({
          ...validData,
          category_code: code,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe("amount_cents validation", () => {
    it("rejects zero", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        amount_cents: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be greater than 0");
      }
    });

    it("rejects negative values", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        amount_cents: -100,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer values (float)", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        amount_cents: 123.45,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be an integer");
      }
    });

    it("rejects string instead of number", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        amount_cents: "123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing amount_cents", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { amount_cents, ...dataWithoutAmount } = validData;
      const result = CreateTransactionSchema.safeParse(dataWithoutAmount);
      expect(result.success).toBe(false);
    });

    it("accepts large values", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        amount_cents: 999999999,
      });
      expect(result.success).toBe(true);
    });

    it("accepts 1 cent", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        amount_cents: 1,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("occurred_on validation", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-12-08T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("rejects future date", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        occurred_on: "2025-12-09",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot be in the future");
      }
    });

    it("rejects invalid format (YYYY/MM/DD)", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        occurred_on: "2025/12/01",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("YYYY-MM-DD format");
      }
    });

    it("rejects format without leading zeros", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        occurred_on: "2025-1-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid date (month > 12)", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        occurred_on: "2025-13-01",
      });
      expect(result.success).toBe(false);
    });

    it("rejects date with time", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        occurred_on: "2025-12-01T10:00:00",
      });
      expect(result.success).toBe(false);
    });

    it("accepts today's date at end of day", () => {
      vi.setSystemTime(new Date("2025-12-08T23:59:59Z"));
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        occurred_on: "2025-12-08",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("note validation", () => {
    it("rejects notes longer than 500 characters", () => {
      const longNote = "a".repeat(501);
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        note: longNote,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot exceed 500 characters");
      }
    });

    it("rejects control characters", () => {
      const noteWithControlChars = "Test\x00note";
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        note: noteWithControlChars,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot contain control characters");
      }
    });

    it("accepts empty note", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        note: "",
      });
      expect(result.success).toBe(true);
    });

    it("accepts notes with special characters (without control chars)", () => {
      const notes = [
        "Test with special chars: !@#$%^&*()",
        "Test with Polish chars: ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ",
        "Test with quotes: \"double\" and 'single'",
      ];

      notes.forEach((note) => {
        const result = CreateTransactionSchema.safeParse({
          ...validData,
          note,
        });
        expect(result.success).toBe(true);
      });
    });

    it("rejects notes with newlines and tabs (control characters)", () => {
      const notesWithControlChars = ["Test\nwith\nnewlines", "Test\twith\ttabs"];

      notesWithControlChars.forEach((note) => {
        const result = CreateTransactionSchema.safeParse({
          ...validData,
          note,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("client_request_id validation", () => {
    it("rejects invalid UUID", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        client_request_id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be a valid UUID");
      }
    });

    it("rejects empty string", () => {
      const result = CreateTransactionSchema.safeParse({
        ...validData,
        client_request_id: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing client_request_id", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { client_request_id, ...dataWithoutRequestId } = validData;
      const result = CreateTransactionSchema.safeParse(dataWithoutRequestId);
      expect(result.success).toBe(false);
    });

    it("accepts UUID in different formats (lowercase/uppercase)", () => {
      const uuids = [
        "123e4567-e89b-12d3-a456-426614174000",
        "123E4567-E89B-12D3-A456-426614174000",
        "00000000-0000-0000-0000-000000000000",
      ];

      uuids.forEach((uuid) => {
        const result = CreateTransactionSchema.safeParse({
          ...validData,
          client_request_id: uuid,
        });
        expect(result.success).toBe(true);
      });
    });
  });
});

describe("UpdateTransactionSchema", () => {
  describe("valid data", () => {
    it("accepts only category_code", () => {
      const result = UpdateTransactionSchema.safeParse({
        category_code: "FOOD_GROCERIES",
      });
      expect(result.success).toBe(true);
    });

    it("accepts only amount_cents", () => {
      const result = UpdateTransactionSchema.safeParse({
        amount_cents: 12345,
      });
      expect(result.success).toBe(true);
    });

    it("accepts only occurred_on", () => {
      const result = UpdateTransactionSchema.safeParse({
        occurred_on: "2025-12-01",
      });
      expect(result.success).toBe(true);
    });

    it("accepts only note", () => {
      const result = UpdateTransactionSchema.safeParse({
        note: "Updated note",
      });
      expect(result.success).toBe(true);
    });

    it("accepts note as null", () => {
      const result = UpdateTransactionSchema.safeParse({
        note: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts multiple fields at once", () => {
      const result = UpdateTransactionSchema.safeParse({
        category_code: "FOOD_GROCERIES",
        amount_cents: 12345,
        occurred_on: "2025-12-01",
        note: "Updated",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("validation - at least one field required", () => {
    it("rejects empty object", () => {
      const result = UpdateTransactionSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("At least one field must be provided");
      }
    });
  });

  describe("amount_cents validation", () => {
    it("rejects zero", () => {
      const result = UpdateTransactionSchema.safeParse({
        amount_cents: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative values", () => {
      const result = UpdateTransactionSchema.safeParse({
        amount_cents: -100,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer values", () => {
      const result = UpdateTransactionSchema.safeParse({
        amount_cents: 123.45,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("category_code validation", () => {
    it("rejects empty string", () => {
      const result = UpdateTransactionSchema.safeParse({
        category_code: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("occurred_on validation", () => {
    it("rejects invalid format", () => {
      const result = UpdateTransactionSchema.safeParse({
        occurred_on: "2025/12/01",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("note validation", () => {
    it("rejects notes longer than 500 characters", () => {
      const longNote = "a".repeat(501);
      const result = UpdateTransactionSchema.safeParse({
        note: longNote,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("GetTransactionsQuerySchema", () => {
  describe("valid data", () => {
    it("accepts empty object (all fields optional)", () => {
      const result = GetTransactionsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("ALL"); // Default
        expect(result.data.limit).toBe(50); // Default
      }
    });

    it("accepts month in YYYY-MM format", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        month: "2025-12",
      });
      expect(result.success).toBe(true);
    });

    it("accepts type as ALL", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        type: "ALL",
      });
      expect(result.success).toBe(true);
    });

    it("accepts type as INCOME", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        type: "INCOME",
      });
      expect(result.success).toBe(true);
    });

    it("accepts type as EXPENSE", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        type: "EXPENSE",
      });
      expect(result.success).toBe(true);
    });

    it("accepts category", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        category: "FOOD_GROCERIES",
      });
      expect(result.success).toBe(true);
    });

    it("accepts search", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        search: "test search",
      });
      expect(result.success).toBe(true);
    });

    it("accepts cursor", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        cursor: "base64encodedcursor",
      });
      expect(result.success).toBe(true);
    });

    it("accepts limit as number", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        limit: 25,
      });
      expect(result.success).toBe(true);
    });

    it("coerces limit from string to number", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        limit: "25",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(typeof result.data.limit).toBe("number");
      }
    });
  });

  describe("month validation", () => {
    it("rejects invalid format", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        month: "2025-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects YYYY-MM-DD format", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        month: "2025-12-01",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("type validation", () => {
    it("rejects invalid type", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        type: "INVALID",
      });
      expect(result.success).toBe(false);
    });

    it("sets default value ALL when type is missing", () => {
      const result = GetTransactionsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("ALL");
      }
    });
  });

  describe("limit validation", () => {
    it("rejects limit < 1", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects limit > 100", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        limit: 101,
      });
      expect(result.success).toBe(false);
    });

    it("accepts limit = 1", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        limit: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts limit = 100", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        limit: 100,
      });
      expect(result.success).toBe(true);
    });

    it("sets default value 50 when limit is missing", () => {
      const result = GetTransactionsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it("rejects non-integer limit", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        limit: 25.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("category validation", () => {
    it("rejects empty string", () => {
      const result = GetTransactionsQuerySchema.safeParse({
        category: "",
      });
      expect(result.success).toBe(false);
    });
  });
});
