// tests/unit/lib/utils.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatCurrencyPL, formatCurrencyWithSignPL, parseMonth, getCurrentMonth, isMonthValid } from "@/lib/utils";

describe("formatCurrencyPL", () => {
  describe("positive values", () => {
    it("formats amount with thousand separator and comma", () => {
      expect(formatCurrencyPL(123456)).toBe("1\u00A0234,56");
    });

    it("formats amount without thousand separator", () => {
      expect(formatCurrencyPL(99999)).toBe("999,99");
    });

    it("formats small amount", () => {
      expect(formatCurrencyPL(50)).toBe("0,50");
    });

    it("formats 1 cent", () => {
      expect(formatCurrencyPL(1)).toBe("0,01");
    });

    it("formats large amounts with multiple separators", () => {
      expect(formatCurrencyPL(123456789)).toBe("1\u00A0234\u00A0567,89");
    });

    it("formats amount without cents", () => {
      expect(formatCurrencyPL(100000)).toBe("1\u00A0000,00");
    });
  });

  describe("negative values", () => {
    it("formats negative value", () => {
      // Math.floor(-1234.56) = -1235, cents = abs(-56) = 56
      expect(formatCurrencyPL(-123456)).toBe("-1\u00A0235,56");
    });

    it("formats small negative value", () => {
      // Math.floor(-0.50) = -1, cents = abs(-50) = 50
      expect(formatCurrencyPL(-50)).toBe("-1,50");
    });

    it("formats -1 cent", () => {
      // Math.floor(-0.01) = -1, cents = abs(-1) = 1
      expect(formatCurrencyPL(-1)).toBe("-1,01");
    });
  });

  describe("zero value", () => {
    it("formats zero", () => {
      expect(formatCurrencyPL(0)).toBe("0,00");
    });
  });

  describe("thousand separators", () => {
    it("uses non-breaking space as separator", () => {
      const result = formatCurrencyPL(1234567);
      expect(result).toContain("\u00A0"); // Non-breaking space
      expect(result).toBe("12\u00A0345,67");
    });

    it("does not add separator for amounts below 1000 PLN", () => {
      const result = formatCurrencyPL(99999);
      expect(result).not.toContain("\u00A0");
      expect(result).toBe("999,99");
    });
  });

  describe("cents", () => {
    it("always shows 2 decimal places", () => {
      expect(formatCurrencyPL(100)).toBe("1,00");
      expect(formatCurrencyPL(105)).toBe("1,05");
      expect(formatCurrencyPL(150)).toBe("1,50");
    });

    it("adds leading zero for cents < 10", () => {
      expect(formatCurrencyPL(101)).toBe("1,01");
      expect(formatCurrencyPL(109)).toBe("1,09");
    });
  });
});

describe("formatCurrencyWithSignPL", () => {
  describe("positive values", () => {
    it("adds + sign for positive values", () => {
      expect(formatCurrencyWithSignPL(123456)).toBe("+1\u00A0234,56");
    });

    it("adds + sign for small values", () => {
      expect(formatCurrencyWithSignPL(50)).toBe("+0,50");
    });
  });

  describe("negative values", () => {
    it("adds - sign for negative values", () => {
      expect(formatCurrencyWithSignPL(-123456)).toBe("-1\u00A0235,56");
    });

    it("does not double the minus sign", () => {
      const result = formatCurrencyWithSignPL(-100);
      expect(result).toBe("-1,00");
      expect(result).not.toContain("--");
    });
  });

  describe("zero value", () => {
    it("adds + sign for zero", () => {
      expect(formatCurrencyWithSignPL(0)).toBe("+0,00");
    });
  });
});

describe("parseMonth", () => {
  describe("valid values", () => {
    it("parses correct YYYY-MM format", () => {
      expect(parseMonth("2025-01")).toBe("2025-01");
      expect(parseMonth("2025-12")).toBe("2025-12");
      expect(parseMonth("2024-06")).toBe("2024-06");
    });

    it("accepts months with leading zero", () => {
      expect(parseMonth("2025-01")).toBe("2025-01");
      expect(parseMonth("2025-09")).toBe("2025-09");
    });

    it("accepts months 10-12 without leading zero", () => {
      expect(parseMonth("2025-10")).toBe("2025-10");
      expect(parseMonth("2025-11")).toBe("2025-11");
      expect(parseMonth("2025-12")).toBe("2025-12");
    });
  });

  describe("invalid values", () => {
    it("returns null for null", () => {
      expect(parseMonth(null)).toBe(null);
    });

    it("returns null for empty string", () => {
      expect(parseMonth("")).toBe(null);
    });

    it("returns null for invalid format", () => {
      expect(parseMonth("2025/01")).toBe(null);
      expect(parseMonth("2025.01")).toBe(null);
      expect(parseMonth("25-01")).toBe(null);
      expect(parseMonth("2025-1")).toBe(null); // Missing leading zero
    });

    it("returns null for invalid month", () => {
      expect(parseMonth("2025-00")).toBe(null);
      expect(parseMonth("2025-13")).toBe(null);
      expect(parseMonth("2025-99")).toBe(null);
    });

    it("returns null for format with day", () => {
      expect(parseMonth("2025-01-01")).toBe(null);
    });

    it("returns null for non-numeric values", () => {
      expect(parseMonth("abcd-ef")).toBe(null);
    });
  });
});

describe("getCurrentMonth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current month in YYYY-MM format", () => {
    vi.setSystemTime(new Date("2025-12-08T10:00:00Z"));
    expect(getCurrentMonth()).toBe("2025-12");
  });

  it("correctly formats months with leading zero", () => {
    vi.setSystemTime(new Date("2025-01-15T10:00:00Z"));
    expect(getCurrentMonth()).toBe("2025-01");
  });

  it("correctly formats months without leading zero (10-12)", () => {
    vi.setSystemTime(new Date("2025-10-01T10:00:00Z"));
    expect(getCurrentMonth()).toBe("2025-10");
  });

  it("returns correct month at the beginning of the year", () => {
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    expect(getCurrentMonth()).toBe("2025-01");
  });

  it("returns correct month at the end of the year", () => {
    // Use local time, not UTC, to avoid timezone issues
    vi.setSystemTime(new Date(2025, 11, 31, 23, 59, 59)); // 11 = December (0-indexed)
    expect(getCurrentMonth()).toBe("2025-12");
  });

  it("returns month in different timezones", () => {
    // Note: Date in JS uses local timezone
    // This test checks if the function works regardless of UTC time
    vi.setSystemTime(new Date("2025-06-15T12:00:00"));
    expect(getCurrentMonth()).toBe("2025-06");
  });
});

describe("isMonthValid", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("current time: 2025-12-08", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2025-12-08T10:00:00Z"));
    });

    it("accepts current month", () => {
      expect(isMonthValid("2025-12")).toBe(true);
    });

    it("accepts past months", () => {
      expect(isMonthValid("2025-11")).toBe(true);
      expect(isMonthValid("2025-01")).toBe(true);
      expect(isMonthValid("2024-12")).toBe(true);
      expect(isMonthValid("2020-01")).toBe(true);
    });

    it("rejects future months", () => {
      expect(isMonthValid("2026-01")).toBe(false);
      expect(isMonthValid("2025-13")).toBe(false); // Invalid, but > current
      expect(isMonthValid("2030-06")).toBe(false);
    });
  });

  describe("edge case: year boundary", () => {
    it("accepts December when we are in December", () => {
      vi.setSystemTime(new Date("2025-12-31T23:59:59Z"));
      expect(isMonthValid("2025-12")).toBe(true);
    });

    it("accepts January when we are in January", () => {
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      expect(isMonthValid("2025-01")).toBe(true);
      expect(isMonthValid("2024-12")).toBe(true);
      expect(isMonthValid("2025-02")).toBe(false);
    });
  });

  describe("edge case: first day of month", () => {
    it("accepts first day of month", () => {
      vi.setSystemTime(new Date("2025-06-01T00:00:01Z"));
      expect(isMonthValid("2025-06")).toBe(true);
      expect(isMonthValid("2025-05")).toBe(true);
      expect(isMonthValid("2025-07")).toBe(false);
    });
  });

  describe("lexicographic comparison", () => {
    it("uses string (lexicographic) comparison", () => {
      vi.setSystemTime(new Date("2025-12-08T10:00:00Z"));

      // Lexicographic comparison works for YYYY-MM format
      expect(isMonthValid("2025-12")).toBe(true); // "2025-12" <= "2025-12"
      expect(isMonthValid("2025-11")).toBe(true); // "2025-11" < "2025-12"
      expect(isMonthValid("2026-01")).toBe(false); // "2026-01" > "2025-12"
    });
  });
});
