import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatuje kwotę w groszach na czytelny format PLN
 * @param cents - Kwota w groszach
 * @returns Sformatowana kwota z separatorami tysięcy (spacja niełamliwa) i przecinkiem dziesiętnym
 * @example formatCurrencyPL(123456) => "1 234,56"
 */
export function formatCurrencyPL(cents: number): string {
  const zloty = Math.floor(cents / 100);
  const grosze = Math.abs(cents % 100);

  // Formatowanie złotych z separatorem tysięcy (spacja niełamliwa)
  const formatted = zloty.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");

  // Dodanie groszy z wiodącym zerem jeśli potrzebne
  const groszStr = grosze.toString().padStart(2, "0");

  return `${formatted},${groszStr}`;
}

/**
 * Formatuje kwotę w groszach na format PLN ze znakiem (+ dla dodatnich, - dla ujemnych)
 * @param cents - Kwota w groszach
 * @returns Sformatowana kwota ze znakiem
 * @example formatCurrencyWithSignPL(123456) => "+1 234,56"
 * @example formatCurrencyWithSignPL(-123456) => "-1 234,56"
 */
export function formatCurrencyWithSignPL(cents: number): string {
  const sign = cents >= 0 ? "+" : "";
  return `${sign}${formatCurrencyPL(cents)}`;
}

/**
 * Parsuje miesiąc z query params lub localStorage, z walidacją formatu
 * @param value - Wartość do sparsowania
 * @returns Miesiąc w formacie YYYY-MM lub null jeśli nieprawidłowy
 */
export function parseMonth(value: string | null): string | null {
  if (!value) return null;

  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!monthRegex.test(value)) return null;

  return value;
}

/**
 * Zwraca bieżący miesiąc w formacie YYYY-MM
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Sprawdza czy podany miesiąc nie jest w przyszłości
 * @param month - Miesiąc w formacie YYYY-MM
 * @returns true jeśli miesiąc jest w przeszłości lub obecny
 */
export function isMonthValid(month: string): boolean {
  const current = getCurrentMonth();
  return month <= current;
}
