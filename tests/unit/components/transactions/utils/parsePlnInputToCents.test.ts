// tests/unit/components/transactions/utils/parsePlnInputToCents.test.ts

import { describe, it, expect } from "vitest";
import { parsePlnInputToCents, formatCentsToPlnInput } from "@/components/transactions/utils/parsePlnInputToCents";

describe("parsePlnInputToCents", () => {
  describe("valid values", () => {
    it("parses amount with comma (Polish format)", () => {
      expect(parsePlnInputToCents("1234,56")).toBe(123456);
    });

    it("parses amount with dot (international format)", () => {
      expect(parsePlnInputToCents("1234.56")).toBe(123456);
    });

    it("parses amount without cents", () => {
      expect(parsePlnInputToCents("1234")).toBe(123400);
    });

    it("parses only cents (0,50)", () => {
      expect(parsePlnInputToCents("0,50")).toBe(50);
    });

    it("parses one cent (0,01)", () => {
      expect(parsePlnInputToCents("0,01")).toBe(1);
    });

    it("parses large amounts", () => {
      expect(parsePlnInputToCents("1000000,99")).toBe(100000099);
    });

    it("parses amount with one decimal place", () => {
      expect(parsePlnInputToCents("12,5")).toBe(1250);
    });

    it("parses amount with exactly two decimal places", () => {
      expect(parsePlnInputToCents("99,99")).toBe(9999);
    });
  });

  describe("whitespace handling", () => {
    it("removes whitespace from beginning and end", () => {
      expect(parsePlnInputToCents("  123,45  ")).toBe(12345);
    });

    it("handles only whitespace", () => {
      expect(parsePlnInputToCents("   ")).toBe(null);
    });
  });

  describe("invalid values - returns null", () => {
    it("returns null for empty string", () => {
      expect(parsePlnInputToCents("")).toBe(null);
    });

    it("returns null for zero", () => {
      expect(parsePlnInputToCents("0")).toBe(null);
    });

    it("returns null for zero with cents (0,00)", () => {
      expect(parsePlnInputToCents("0,00")).toBe(null);
    });

    it("returns null for negative values", () => {
      expect(parsePlnInputToCents("-100")).toBe(null);
      expect(parsePlnInputToCents("-0,50")).toBe(null);
    });

    it("returns null for non-numeric values", () => {
      expect(parsePlnInputToCents("abc")).toBe(null);
      expect(parsePlnInputToCents("12abc")).toBe(null);
      expect(parsePlnInputToCents("abc34")).toBe(null);
    });

    it("returns null for more than 2 decimal places", () => {
      expect(parsePlnInputToCents("12,345")).toBe(null);
      expect(parsePlnInputToCents("12,3456")).toBe(null);
    });

    it("returns null for multiple separators", () => {
      expect(parsePlnInputToCents("12,,34")).toBe(null);
      expect(parsePlnInputToCents("12..34")).toBe(null);
      expect(parsePlnInputToCents("12,34,56")).toBe(null);
    });

    it("returns null for separator at the beginning", () => {
      expect(parsePlnInputToCents(",50")).toBe(null);
      expect(parsePlnInputToCents(".50")).toBe(null);
    });

    it("accepts separator at the end (no digits after decimal)", () => {
      // Regex /^\d+(\.\d{0,2})?$/ accepts 0 digits after dot
      // "50," → "50." → regex matches → parseFloat("50.") = 50 → 5000 cents
      expect(parsePlnInputToCents("50,")).toBe(5000);
      expect(parsePlnInputToCents("50.")).toBe(5000);
    });

    it("returns null for null", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(parsePlnInputToCents(null as any)).toBe(null);
    });

    it("returns null for undefined", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(parsePlnInputToCents(undefined as any)).toBe(null);
    });

    it("returns null for other types (number, object)", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(parsePlnInputToCents(123 as any)).toBe(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(parsePlnInputToCents({} as any)).toBe(null);
    });
  });

  describe("edge cases - rounding", () => {
    it("rounds values with more than 2 decimal places (if regex passes)", () => {
      // Regex shouldn't allow more than 2 places, but if it did...
      // Function uses Math.round()
      expect(parsePlnInputToCents("12,99")).toBe(1299);
    });

    it("correctly converts boundary values", () => {
      expect(parsePlnInputToCents("0,99")).toBe(99);
      expect(parsePlnInputToCents("1,00")).toBe(100);
    });
  });
});

describe("formatCentsToPlnInput", () => {
  describe("valid values", () => {
    it("formats cents to PLN with two decimal places", () => {
      expect(formatCentsToPlnInput(123456)).toBe("1234.56");
    });

    it("formats 50 cents", () => {
      expect(formatCentsToPlnInput(50)).toBe("0.50");
    });

    it("formats 1 cent", () => {
      expect(formatCentsToPlnInput(1)).toBe("0.01");
    });

    it("formats amount without cents", () => {
      expect(formatCentsToPlnInput(123400)).toBe("1234.00");
    });

    it("formats zero", () => {
      expect(formatCentsToPlnInput(0)).toBe("0.00");
    });

    it("formats large amounts", () => {
      expect(formatCentsToPlnInput(100000099)).toBe("1000000.99");
    });
  });

  describe("invalid values", () => {
    it("returns 0.00 for NaN", () => {
      expect(formatCentsToPlnInput(NaN)).toBe("0.00");
    });

    it("returns 0.00 for null", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatCentsToPlnInput(null as any)).toBe("0.00");
    });

    it("returns 0.00 for undefined", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatCentsToPlnInput(undefined as any)).toBe("0.00");
    });
  });

  describe("negative values", () => {
    it("formats negative values (if passed)", () => {
      expect(formatCentsToPlnInput(-123456)).toBe("-1234.56");
    });
  });

  describe("roundtrip - parse and format", () => {
    it("parse → format → parse returns the same value", () => {
      const original = "1234,56";
      const cents = parsePlnInputToCents(original);

      if (cents === null) {
        throw new Error("Expected cents to be a number");
      }

      const formatted = formatCentsToPlnInput(cents);
      const reparsed = parsePlnInputToCents(formatted.replace(".", ","));

      expect(cents).toBe(123456);
      expect(formatted).toBe("1234.56");
      expect(reparsed).toBe(123456);
    });
  });
});
