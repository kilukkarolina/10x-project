// src/components/transactions/utils/parsePlnInputToCents.ts

/**
 * Parsuje kwotę w formacie PLN (string) do groszy (int)
 *
 * Akceptuje separatory dziesiętne: , lub .
 * Dokładność: maksymalnie 2 miejsca po przecinku
 * Zwraca wartość w groszach (int) lub null jeśli niepoprawna
 *
 * @example
 * parsePlnInputToCents("1234,56") // 123456
 * parsePlnInputToCents("1234.56") // 123456
 * parsePlnInputToCents("1234") // 123400
 * parsePlnInputToCents("0,50") // 50
 * parsePlnInputToCents("") // null
 * parsePlnInputToCents("abc") // null
 * parsePlnInputToCents("-100") // null (wartości ujemne nie dozwolone)
 */
export function parsePlnInputToCents(input: string): number | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  // Usuń białe znaki
  const trimmed = input.trim();

  if (trimmed === "") {
    return null;
  }

  // Zamień przecinek na kropkę dla spójności
  const normalized = trimmed.replace(",", ".");

  // Walidacja formatu: dozwolone tylko cyfry, kropka i opcjonalnie znak minus na początku
  // Ale nie akceptujemy wartości ujemnych
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = parseFloat(normalized);

  // Sprawdź czy wartość jest poprawna i dodatnia
  if (isNaN(parsed) || parsed <= 0) {
    return null;
  }

  // Konwertuj do groszy i zaokrąglij
  const cents = Math.round(parsed * 100);

  return cents;
}

/**
 * Formatuje kwotę z groszy (int) do PLN (string)
 *
 * @example
 * formatCentsToPlnInput(123456) // "1234.56"
 * formatCentsToPlnInput(50) // "0.50"
 * formatCentsToPlnInput(123400) // "1234.00"
 */
export function formatCentsToPlnInput(cents: number): string {
  if (typeof cents !== "number" || isNaN(cents)) {
    return "0.00";
  }

  const pln = cents / 100;
  return pln.toFixed(2);
}
