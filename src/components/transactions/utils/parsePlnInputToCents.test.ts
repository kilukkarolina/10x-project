/**
 * Unit tests for PLN amount parsing utilities
 * These tests verify the critical financial logic
 */

import { describe, it, expect } from "vitest";
import { parsePlnInputToCents, formatCentsToPlnInput } from "./parsePlnInputToCents";

describe("parsePlnInputToCents", () => {
  describe("happy path - valid inputs", () => {
    it("should parse comma format", () => {
      expect(parsePlnInputToCents("1234,56")).toBe(123456);
    });

    it("should parse dot format", () => {
      expect(parsePlnInputToCents("1234.56")).toBe(123456);
    });

    it("should parse integer without decimals", () => {
      expect(parsePlnInputToCents("1234")).toBe(123400);
    });

    it("should parse amount with one decimal place", () => {
      expect(parsePlnInputToCents("1234,5")).toBe(123450);
    });

    it("should handle small amounts", () => {
      expect(parsePlnInputToCents("0,01")).toBe(1);
      expect(parsePlnInputToCents("0.50")).toBe(50);
    });
  });

  describe("error cases - invalid inputs", () => {
    it("should return null for empty string", () => {
      expect(parsePlnInputToCents("")).toBe(null);
    });

    it("should return null for whitespace only", () => {
      expect(parsePlnInputToCents("   ")).toBe(null);
    });

    it("should return null for non-numeric input", () => {
      expect(parsePlnInputToCents("abc")).toBe(null);
    });

    it("should return null for negative amounts", () => {
      expect(parsePlnInputToCents("-100")).toBe(null);
    });

    it("should return null for zero", () => {
      expect(parsePlnInputToCents("0")).toBe(null);
      expect(parsePlnInputToCents("0,00")).toBe(null);
    });

    it("should return null for invalid format with multiple separators", () => {
      expect(parsePlnInputToCents("1,234.56")).toBe(null);
    });
  });

  describe("edge cases", () => {
    it("should handle very large amounts within reasonable range", () => {
      expect(parsePlnInputToCents("999999,99")).toBe(99999999);
    });

    it("should handle trimming whitespace", () => {
      expect(parsePlnInputToCents("  1234,56  ")).toBe(123456);
    });

    it("should handle amounts with too many decimal places by validation", () => {
      // More than 2 decimal places should be rejected
      expect(parsePlnInputToCents("1234,567")).toBe(null);
    });
  });
});

describe("formatCentsToPlnInput", () => {
  it("should format cents to PLN with 2 decimal places", () => {
    expect(formatCentsToPlnInput(123456)).toBe("1234.56");
  });

  it("should format small amounts correctly", () => {
    expect(formatCentsToPlnInput(50)).toBe("0.50");
    expect(formatCentsToPlnInput(1)).toBe("0.01");
  });

  it("should format whole amounts with .00", () => {
    expect(formatCentsToPlnInput(123400)).toBe("1234.00");
  });

  it("should handle zero", () => {
    expect(formatCentsToPlnInput(0)).toBe("0.00");
  });

  it("should handle invalid inputs", () => {
    expect(formatCentsToPlnInput(NaN)).toBe("0.00");
  });
});
