// tests/unit/lib/schemas/goal-event.schema.test.ts

import { describe, it, expect } from "vitest";
import { CreateGoalEventSchema, ListGoalEventsQuerySchema } from "@/lib/schemas/goal-event.schema";

describe("CreateGoalEventSchema", () => {
  const validData = {
    goal_id: "123e4567-e89b-12d3-a456-426614174000",
    type: "DEPOSIT" as const,
    amount_cents: 50000,
    occurred_on: "2025-12-01",
    client_request_id: "req-123",
  };

  describe("valid data", () => {
    it("accepts complete valid data with DEPOSIT", () => {
      const result = CreateGoalEventSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("accepts complete valid data with WITHDRAW", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        type: "WITHDRAW",
      });
      expect(result.success).toBe(true);
    });

    it("accepts various date formats (YYYY-MM-DD)", () => {
      const dates = ["2025-01-01", "2025-12-31", "2020-06-15"];
      dates.forEach((date) => {
        const result = CreateGoalEventSchema.safeParse({
          ...validData,
          occurred_on: date,
        });
        expect(result.success).toBe(true);
      });
    });

    it("accepts large amounts", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        amount_cents: 999999999,
      });
      expect(result.success).toBe(true);
    });

    it("accepts 1 cent", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        amount_cents: 1,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("goal_id validation", () => {
    it("rejects invalid UUID format", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        goal_id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be a valid UUID");
      }
    });

    it("rejects UUID without hyphens", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        goal_id: "123e4567e89b12d3a456426614174000",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        goal_id: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing goal_id", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { goal_id, ...dataWithoutGoalId } = validData;
      const result = CreateGoalEventSchema.safeParse(dataWithoutGoalId);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Goal ID is required");
      }
    });

    it("accepts UUID in uppercase", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        goal_id: "123E4567-E89B-12D3-A456-426614174000",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("type validation", () => {
    it("rejects invalid type", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        type: "INVALID",
      });
      expect(result.success).toBe(false);
    });

    it("rejects lowercase type", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        type: "deposit",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing type", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { type, ...dataWithoutType } = validData;
      const result = CreateGoalEventSchema.safeParse(dataWithoutType);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Type is required");
      }
    });
  });

  describe("amount_cents validation", () => {
    it("rejects zero", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        amount_cents: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be greater than 0");
      }
    });

    it("rejects negative values", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        amount_cents: -100,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer values (float)", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        amount_cents: 123.45,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be an integer");
      }
    });

    it("rejects string instead of number", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        amount_cents: "123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing amount_cents", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { amount_cents, ...dataWithoutAmount } = validData;
      const result = CreateGoalEventSchema.safeParse(dataWithoutAmount);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Amount is required");
      }
    });
  });

  describe("occurred_on validation", () => {
    it("rejects invalid format (YYYY/MM/DD)", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        occurred_on: "2025/12/01",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("YYYY-MM-DD format");
      }
    });

    it("rejects format without leading zeros", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        occurred_on: "2025-1-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects date with time", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        occurred_on: "2025-12-01T10:00:00",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid date string (fails regex)", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        occurred_on: "not-a-date",
      });
      expect(result.success).toBe(false);
      // Fails on regex, not on date validation
    });

    it("accepts impossible date (2025-02-30) - JS Date accepts it", () => {
      // JavaScript's new Date("2025-02-30") creates a valid Date object (March 2nd)
      // The schema only checks if Date is valid, not if the specific date is calendar-valid
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        occurred_on: "2025-02-30",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing occurred_on", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { occurred_on, ...dataWithoutDate } = validData;
      const result = CreateGoalEventSchema.safeParse(dataWithoutDate);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Occurred date is required");
      }
    });

    it("accepts valid leap year date", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        occurred_on: "2024-02-29",
      });
      expect(result.success).toBe(true);
    });

    it("accepts invalid leap year date (JS Date accepts it)", () => {
      // JavaScript's new Date("2025-02-29") creates a valid Date object (March 1st)
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        occurred_on: "2025-02-29", // 2025 is not a leap year
      });
      expect(result.success).toBe(true);
    });
  });

  describe("client_request_id validation", () => {
    it("rejects empty string", () => {
      const result = CreateGoalEventSchema.safeParse({
        ...validData,
        client_request_id: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot be empty");
      }
    });

    it("rejects missing client_request_id", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { client_request_id, ...dataWithoutRequestId } = validData;
      const result = CreateGoalEventSchema.safeParse(dataWithoutRequestId);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Client request ID is required");
      }
    });

    it("accepts various string formats", () => {
      const requestIds = ["req-123", "123e4567-e89b-12d3-a456-426614174000", "custom-id-2025", "REQUEST_ID_001"];

      requestIds.forEach((id) => {
        const result = CreateGoalEventSchema.safeParse({
          ...validData,
          client_request_id: id,
        });
        expect(result.success).toBe(true);
      });
    });
  });
});

describe("ListGoalEventsQuerySchema", () => {
  describe("valid data", () => {
    it("accepts empty object (all fields optional)", () => {
      const result = ListGoalEventsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50); // Default
      }
    });

    it("accepts only goal_id", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        goal_id: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(result.success).toBe(true);
    });

    it("accepts only month", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        month: "2025-12",
      });
      expect(result.success).toBe(true);
    });

    it("accepts only type", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        type: "DEPOSIT",
      });
      expect(result.success).toBe(true);
    });

    it("accepts only cursor", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        cursor: "base64encodedcursor",
      });
      expect(result.success).toBe(true);
    });

    it("accepts only limit", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        limit: 25,
      });
      expect(result.success).toBe(true);
    });

    it("accepts all fields together", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        goal_id: "123e4567-e89b-12d3-a456-426614174000",
        month: "2025-12",
        type: "WITHDRAW",
        cursor: "cursor123",
        limit: 100,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("goal_id validation", () => {
    it("rejects invalid UUID", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        goal_id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be a valid UUID");
      }
    });

    it("rejects UUID without hyphens", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        goal_id: "123e4567e89b12d3a456426614174000",
      });
      expect(result.success).toBe(false);
    });

    it("accepts UUID in uppercase", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        goal_id: "123E4567-E89B-12D3-A456-426614174000",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("month validation", () => {
    it("accepts valid YYYY-MM format", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        month: "2025-12",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid format (YYYY-M)", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        month: "2025-1",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("YYYY-MM format");
      }
    });

    it("rejects YYYY-MM-DD format", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        month: "2025-12-01",
      });
      expect(result.success).toBe(false);
    });

    it("accepts month with value > 12 (regex only checks format)", () => {
      // Regex /^\d{4}-\d{2}$/ only checks format, not if month is valid
      const result = ListGoalEventsQuerySchema.safeParse({
        month: "2025-13",
      });
      expect(result.success).toBe(true);
    });

    it("accepts various valid months", () => {
      const months = ["2025-01", "2025-06", "2025-12", "2020-03"];
      months.forEach((month) => {
        const result = ListGoalEventsQuerySchema.safeParse({ month });
        expect(result.success).toBe(true);
      });
    });
  });

  describe("type validation", () => {
    it("accepts DEPOSIT", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        type: "DEPOSIT",
      });
      expect(result.success).toBe(true);
    });

    it("accepts WITHDRAW", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        type: "WITHDRAW",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid type", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        type: "INVALID",
      });
      expect(result.success).toBe(false);
    });

    it("rejects lowercase type", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        type: "deposit",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("limit validation", () => {
    it("accepts limit = 1", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        limit: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts limit = 100", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        limit: 100,
      });
      expect(result.success).toBe(true);
    });

    it("rejects limit < 1", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        limit: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be at least 1");
      }
    });

    it("rejects limit > 100", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        limit: 101,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot exceed 100");
      }
    });

    it("rejects non-integer limit", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        limit: 25.5,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be an integer");
      }
    });

    it("coerces string to number", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        limit: "25",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(typeof result.data.limit).toBe("number");
      }
    });

    it("sets default to 50 when omitted", () => {
      const result = ListGoalEventsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });
  });

  describe("cursor validation", () => {
    it("accepts any string as cursor", () => {
      const cursors = ["base64string", "cursor123", "abc_def_ghi"];
      cursors.forEach((cursor) => {
        const result = ListGoalEventsQuerySchema.safeParse({ cursor });
        expect(result.success).toBe(true);
      });
    });

    it("accepts empty string as cursor", () => {
      const result = ListGoalEventsQuerySchema.safeParse({
        cursor: "",
      });
      expect(result.success).toBe(true);
    });
  });
});
