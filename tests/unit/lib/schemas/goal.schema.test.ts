// tests/unit/lib/schemas/goal.schema.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CreateGoalSchema,
  UpdateGoalSchema,
  ListGoalsQuerySchema,
  GetGoalByIdParamsSchema,
  GetGoalByIdQuerySchema,
  UpdateGoalParamsSchema,
  ArchiveGoalParamsSchema,
} from "@/lib/schemas/goal.schema";

describe("CreateGoalSchema", () => {
  const validData = {
    name: "Emergency Fund",
    type_code: "SAVINGS",
    target_amount_cents: 100000,
    is_priority: true,
  };

  describe("valid data", () => {
    it("accepts complete valid data", () => {
      const result = CreateGoalSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("accepts data without is_priority (defaults to false)", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { is_priority, ...dataWithoutPriority } = validData;
      const result = CreateGoalSchema.safeParse(dataWithoutPriority);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_priority).toBe(false);
      }
    });

    it("accepts is_priority as false", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        is_priority: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts name with maximum length (100 characters)", () => {
      const longName = "a".repeat(100);
      const result = CreateGoalSchema.safeParse({
        ...validData,
        name: longName,
      });
      expect(result.success).toBe(true);
    });

    it("accepts various type codes", () => {
      const typeCodes = ["SAVINGS", "INVESTMENT", "VACATION", "OTHER"];
      typeCodes.forEach((code) => {
        const result = CreateGoalSchema.safeParse({
          ...validData,
          type_code: code,
        });
        expect(result.success).toBe(true);
      });
    });

    it("accepts large target amounts", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        target_amount_cents: 999999999,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("name validation", () => {
    it("rejects empty name", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        name: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Name is required");
      }
    });

    it("rejects name longer than 100 characters", () => {
      const longName = "a".repeat(101);
      const result = CreateGoalSchema.safeParse({
        ...validData,
        name: longName,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot exceed 100 characters");
      }
    });

    it("rejects missing name", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { name, ...dataWithoutName } = validData;
      const result = CreateGoalSchema.safeParse(dataWithoutName);
      expect(result.success).toBe(false);
    });

    it("accepts name with special characters", () => {
      const names = ["Emergency Fund 2024!", "Vacation (Europe)", "Car - New Honda", "Investment: Stock Portfolio"];

      names.forEach((name) => {
        const result = CreateGoalSchema.safeParse({
          ...validData,
          name,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe("type_code validation", () => {
    it("rejects empty type_code", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        type_code: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Goal type code is required");
      }
    });

    it("rejects missing type_code", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { type_code, ...dataWithoutType } = validData;
      const result = CreateGoalSchema.safeParse(dataWithoutType);
      expect(result.success).toBe(false);
    });
  });

  describe("target_amount_cents validation", () => {
    it("rejects zero", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        target_amount_cents: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be greater than 0");
      }
    });

    it("rejects negative values", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        target_amount_cents: -100,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer values (float)", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        target_amount_cents: 123.45,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be an integer");
      }
    });

    it("rejects string instead of number", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        target_amount_cents: "123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing target_amount_cents", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { target_amount_cents, ...dataWithoutAmount } = validData;
      const result = CreateGoalSchema.safeParse(dataWithoutAmount);
      expect(result.success).toBe(false);
    });

    it("accepts 1 cent", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        target_amount_cents: 1,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("is_priority validation", () => {
    it("rejects non-boolean values", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        is_priority: "true",
      });
      expect(result.success).toBe(false);
    });

    it("rejects number instead of boolean", () => {
      const result = CreateGoalSchema.safeParse({
        ...validData,
        is_priority: 1,
      });
      expect(result.success).toBe(false);
    });

    it("sets default to false when omitted", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { is_priority, ...dataWithoutPriority } = validData;
      const result = CreateGoalSchema.safeParse(dataWithoutPriority);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_priority).toBe(false);
      }
    });
  });
});

describe("ListGoalsQuerySchema", () => {
  describe("valid data", () => {
    it("accepts empty object (defaults to false)", () => {
      const result = ListGoalsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_archived).toBe(false);
      }
    });

    it("accepts boolean true", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_archived).toBe(true);
      }
    });

    it("accepts boolean false", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_archived).toBe(false);
      }
    });
  });

  describe("preprocessing - string to boolean conversion", () => {
    it("converts string 'true' to boolean true", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: "true",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_archived).toBe(true);
      }
    });

    it("converts string 'false' to boolean false", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: "false",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_archived).toBe(false);
      }
    });

    it("converts string '1' to boolean true", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: "1",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_archived).toBe(true);
      }
    });

    it("converts string '0' to boolean false", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: "0",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_archived).toBe(false);
      }
    });

    it("converts null to boolean false", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_archived).toBe(false);
      }
    });

    it("converts undefined to boolean false", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: undefined,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_archived).toBe(false);
      }
    });
  });

  describe("preprocessing - invalid values rejected", () => {
    it("rejects string 'yes'", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: "yes",
      });
      expect(result.success).toBe(false);
    });

    it("rejects string 'no'", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: "no",
      });
      expect(result.success).toBe(false);
    });

    it("rejects string 'maybe'", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: "maybe",
      });
      expect(result.success).toBe(false);
    });

    it("rejects number 1", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: 1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects number 0", () => {
      const result = ListGoalsQuerySchema.safeParse({
        include_archived: 0,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("GetGoalByIdParamsSchema", () => {
  describe("valid data", () => {
    it("accepts valid UUID", () => {
      const result = GetGoalByIdParamsSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(result.success).toBe(true);
    });

    it("accepts UUID in uppercase", () => {
      const result = GetGoalByIdParamsSchema.safeParse({
        id: "123E4567-E89B-12D3-A456-426614174000",
      });
      expect(result.success).toBe(true);
    });

    it("accepts UUID with all zeros", () => {
      const result = GetGoalByIdParamsSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000000",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid data", () => {
    it("rejects invalid UUID format", () => {
      const result = GetGoalByIdParamsSchema.safeParse({
        id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid goal ID format");
      }
    });

    it("rejects UUID without hyphens", () => {
      const result = GetGoalByIdParamsSchema.safeParse({
        id: "123e4567e89b12d3a456426614174000",
      });
      expect(result.success).toBe(false);
    });

    it("rejects shortened UUID", () => {
      const result = GetGoalByIdParamsSchema.safeParse({
        id: "123e4567-e89b",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const result = GetGoalByIdParamsSchema.safeParse({
        id: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing id", () => {
      const result = GetGoalByIdParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

describe("GetGoalByIdQuerySchema", () => {
  describe("include_events preprocessing", () => {
    it("defaults to true when omitted", () => {
      const result = GetGoalByIdQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(true);
      }
    });

    it("accepts boolean true", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(true);
      }
    });

    it("accepts boolean false", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(false);
      }
    });

    it("converts string 'true' to boolean true", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: "true",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(true);
      }
    });

    it("converts string 'false' to boolean false", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: "false",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(false);
      }
    });

    it("converts string '1' to boolean true", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: "1",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(true);
      }
    });

    it("converts string '0' to boolean false", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: "0",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(false);
      }
    });

    it("converts null to boolean true (default)", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(true);
      }
    });

    it("rejects invalid string values", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: "maybe",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("month preprocessing and validation", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-12-08T10:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("accepts valid YYYY-MM format", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: "2025-12",
      });
      expect(result.success).toBe(true);
    });

    it("accepts past month", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: "2025-01",
      });
      expect(result.success).toBe(true);
    });

    it("accepts current month", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: "2025-12",
      });
      expect(result.success).toBe(true);
    });

    it("rejects future month", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: "2026-01",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot be in the future");
      }
    });

    it("converts null to undefined", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.month).toBeUndefined();
      }
    });

    it("converts undefined to undefined", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: undefined,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.month).toBeUndefined();
      }
    });

    it("converts empty string to undefined", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: "",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.month).toBeUndefined();
      }
    });

    it("rejects invalid format (YYYY-M)", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: "2025-1",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("YYYY-MM format");
      }
    });

    it("rejects YYYY-MM-DD format", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: "2025-12-01",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid month (> 12)", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        month: "2025-13",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("combined parameters", () => {
    it("accepts both include_events and month", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-12-08T10:00:00Z"));

      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: true,
        month: "2025-11",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(true);
        expect(result.data.month).toBe("2025-11");
      }

      vi.useRealTimers();
    });

    it("accepts only include_events", () => {
      const result = GetGoalByIdQuerySchema.safeParse({
        include_events: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(false);
        expect(result.data.month).toBeUndefined();
      }
    });

    it("accepts only month", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-12-08T10:00:00Z"));

      const result = GetGoalByIdQuerySchema.safeParse({
        month: "2025-12",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_events).toBe(true); // Default
        expect(result.data.month).toBe("2025-12");
      }

      vi.useRealTimers();
    });
  });
});

describe("UpdateGoalSchema", () => {
  describe("valid data", () => {
    it("accepts only name", () => {
      const result = UpdateGoalSchema.safeParse({
        name: "Updated Goal Name",
      });
      expect(result.success).toBe(true);
    });

    it("accepts only target_amount_cents", () => {
      const result = UpdateGoalSchema.safeParse({
        target_amount_cents: 200000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts only is_priority", () => {
      const result = UpdateGoalSchema.safeParse({
        is_priority: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts multiple fields at once", () => {
      const result = UpdateGoalSchema.safeParse({
        name: "Updated Goal",
        target_amount_cents: 150000,
        is_priority: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts name with maximum length (100 characters)", () => {
      const longName = "a".repeat(100);
      const result = UpdateGoalSchema.safeParse({
        name: longName,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("validation - at least one field required", () => {
    it("rejects empty object", () => {
      const result = UpdateGoalSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("At least one field must be provided");
      }
    });
  });

  describe("name validation", () => {
    it("rejects empty name", () => {
      const result = UpdateGoalSchema.safeParse({
        name: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot be empty");
      }
    });

    it("rejects name longer than 100 characters", () => {
      const longName = "a".repeat(101);
      const result = UpdateGoalSchema.safeParse({
        name: longName,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("cannot exceed 100 characters");
      }
    });
  });

  describe("target_amount_cents validation", () => {
    it("rejects zero", () => {
      const result = UpdateGoalSchema.safeParse({
        target_amount_cents: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative values", () => {
      const result = UpdateGoalSchema.safeParse({
        target_amount_cents: -100,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer values", () => {
      const result = UpdateGoalSchema.safeParse({
        target_amount_cents: 123.45,
      });
      expect(result.success).toBe(false);
    });

    it("accepts 1 cent", () => {
      const result = UpdateGoalSchema.safeParse({
        target_amount_cents: 1,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("is_priority validation", () => {
    it("rejects non-boolean values", () => {
      const result = UpdateGoalSchema.safeParse({
        is_priority: "true",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("must be a boolean");
      }
    });

    it("rejects number instead of boolean", () => {
      const result = UpdateGoalSchema.safeParse({
        is_priority: 1,
      });
      expect(result.success).toBe(false);
    });

    it("accepts false", () => {
      const result = UpdateGoalSchema.safeParse({
        is_priority: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts true", () => {
      const result = UpdateGoalSchema.safeParse({
        is_priority: true,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("UpdateGoalParamsSchema", () => {
  it("accepts valid UUID", () => {
    const result = UpdateGoalParamsSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = UpdateGoalParamsSchema.safeParse({
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Invalid goal ID format");
    }
  });
});

describe("ArchiveGoalParamsSchema", () => {
  it("accepts valid UUID", () => {
    const result = ArchiveGoalParamsSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = ArchiveGoalParamsSchema.safeParse({
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Invalid goal ID format");
    }
  });
});
