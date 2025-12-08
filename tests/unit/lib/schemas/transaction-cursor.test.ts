// tests/unit/lib/schemas/transaction-cursor.test.ts

import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "@/lib/schemas/transaction.schema";

describe("encodeCursor", () => {
  it("encodes date and UUID to base64", () => {
    const occurredOn = "2025-12-01";
    const id = "123e4567-e89b-12d3-a456-426614174000";

    const cursor = encodeCursor(occurredOn, id);

    // Check that it's encoded
    expect(cursor).toBeTruthy();
    expect(typeof cursor).toBe("string");

    // Check that it can be decoded
    const decoded = atob(cursor);
    expect(decoded).toBe("2025-12-01_123e4567-e89b-12d3-a456-426614174000");
  });

  it("creates different cursors for different dates", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";

    const cursor1 = encodeCursor("2025-12-01", id);
    const cursor2 = encodeCursor("2025-12-02", id);

    expect(cursor1).not.toBe(cursor2);
  });

  it("creates different cursors for different IDs", () => {
    const occurredOn = "2025-12-01";

    const cursor1 = encodeCursor(occurredOn, "123e4567-e89b-12d3-a456-426614174000");
    const cursor2 = encodeCursor(occurredOn, "987e6543-e89b-12d3-a456-426614174999");

    expect(cursor1).not.toBe(cursor2);
  });

  it("handles various YYYY-MM-DD date formats", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";

    expect(() => encodeCursor("2025-01-01", id)).not.toThrow();
    expect(() => encodeCursor("2025-12-31", id)).not.toThrow();
  });
});

describe("decodeCursor", () => {
  describe("valid cursors", () => {
    it("decodes valid cursor", () => {
      const occurredOn = "2025-12-01";
      const id = "123e4567-e89b-12d3-a456-426614174000";
      const cursor = encodeCursor(occurredOn, id);

      const result = decodeCursor(cursor);

      expect(result).toEqual({
        occurred_on: occurredOn,
        id: id,
      });
    });

    it("decodes cursor with various dates", () => {
      const testCases = [
        { occurred_on: "2025-01-01", id: "123e4567-e89b-12d3-a456-426614174000" },
        { occurred_on: "2025-12-31", id: "987e6543-e89b-12d3-a456-426614174999" },
        { occurred_on: "2020-06-15", id: "abcdef12-e89b-12d3-a456-426614174abc" },
      ];

      testCases.forEach(({ occurred_on, id }) => {
        const cursor = encodeCursor(occurred_on, id);
        const result = decodeCursor(cursor);

        expect(result.occurred_on).toBe(occurred_on);
        expect(result.id).toBe(id);
      });
    });
  });

  describe("invalid cursors - invalid base64", () => {
    it("throws error for invalid base64", () => {
      expect(() => decodeCursor("not-valid-base64!!!")).toThrow("Invalid cursor format");
    });

    it("throws error for empty string", () => {
      expect(() => decodeCursor("")).toThrow("Invalid cursor format");
    });
  });

  describe("invalid cursors - invalid structure", () => {
    it("throws error when missing _ separator", () => {
      const invalid = btoa("2025-12-01-123e4567-e89b-12d3-a456-426614174000"); // Used - instead of _
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("throws error for too many parts", () => {
      const invalid = btoa("2025-12-01_123e4567-e89b-12d3-a456-426614174000_extra");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("throws error for only one part", () => {
      const invalid = btoa("2025-12-01");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("throws error for empty content", () => {
      const invalid = btoa("");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });
  });

  describe("invalid cursors - invalid date format", () => {
    it("throws error for date without leading zeros", () => {
      const invalid = btoa("2025-1-1_123e4567-e89b-12d3-a456-426614174000");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("throws error for date in YYYY/MM/DD format", () => {
      const invalid = btoa("2025/12/01_123e4567-e89b-12d3-a456-426614174000");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("throws error for date with time", () => {
      const invalid = btoa("2025-12-01T10:00:00_123e4567-e89b-12d3-a456-426614174000");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("throws error for invalid date", () => {
      const invalid = btoa("not-a-date_123e4567-e89b-12d3-a456-426614174000");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("accepts date with invalid month (but valid YYYY-MM-DD format)", () => {
      const invalid = btoa("2025-13-01_123e4567-e89b-12d3-a456-426614174000");
      // Regex /^\d{4}-\d{2}-\d{2}$/ accepts 13 as month, because it only checks format
      // Function does not validate if date is actually calendar-valid
      const result = decodeCursor(invalid);
      expect(result.occurred_on).toBe("2025-13-01"); // Accepts invalid date
    });

    it("accepts date with invalid day (but valid YYYY-MM-DD format)", () => {
      const invalid = btoa("2025-12-32_123e4567-e89b-12d3-a456-426614174000");
      // Similarly - regex does not validate actual date
      const result = decodeCursor(invalid);
      expect(result.occurred_on).toBe("2025-12-32"); // Accepts invalid date
    });
  });

  describe("invalid cursors - invalid UUID", () => {
    it("throws error for invalid UUID", () => {
      const invalid = btoa("2025-12-01_not-a-valid-uuid");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("throws error for UUID without hyphens", () => {
      const invalid = btoa("2025-12-01_123e4567e89b12d3a456426614174000");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("throws error for shortened UUID", () => {
      const invalid = btoa("2025-12-01_123e4567-e89b");
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("throws error for UUID with invalid characters", () => {
      const invalid = btoa("2025-12-01_123g4567-e89b-12d3-a456-426614174000"); // 'g' is not hex
      expect(() => decodeCursor(invalid)).toThrow("Invalid cursor format");
    });

    it("accepts UUID in different case (lowercase/uppercase)", () => {
      const lowercase = btoa("2025-12-01_123e4567-e89b-12d3-a456-426614174000");
      const uppercase = btoa("2025-12-01_123E4567-E89B-12D3-A456-426614174000");

      expect(() => decodeCursor(lowercase)).not.toThrow();
      expect(() => decodeCursor(uppercase)).not.toThrow();

      expect(decodeCursor(lowercase).id).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(decodeCursor(uppercase).id).toBe("123E4567-E89B-12D3-A456-426614174000");
    });
  });

  describe("roundtrip - encode → decode", () => {
    it("encode → decode returns original values", () => {
      const testCases = [
        { occurred_on: "2025-12-01", id: "123e4567-e89b-12d3-a456-426614174000" },
        { occurred_on: "2020-01-01", id: "00000000-0000-0000-0000-000000000000" },
        { occurred_on: "2030-12-31", id: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
      ];

      testCases.forEach(({ occurred_on, id }) => {
        const encoded = encodeCursor(occurred_on, id);
        const decoded = decodeCursor(encoded);

        expect(decoded.occurred_on).toBe(occurred_on);
        expect(decoded.id).toBe(id);
      });
    });
  });
});
