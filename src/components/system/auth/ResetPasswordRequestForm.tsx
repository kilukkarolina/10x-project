import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";

/**
 * ResetPasswordRequestForm - formularz żądania resetu hasła
 *
 * Odpowiedzialności:
 * - Walidacja adresu e-mail
 * - Wywołanie API /api/v1/auth/reset-password (limit 3/30 min)
 * - Obsługa błędu 429 (rate limit) z wyświetleniem czasu do odblokowania
 * - Wyświetlenie neutralnej odpowiedzi (nie ujawniamy istnienia konta)
 *
 * Note: Integracja z API będzie dodana w kolejnym kroku
 */
export function ResetPasswordRequestForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRateLimitSeconds(null);
    setIsLoading(true);

    try {
      // TODO: Implementacja wywołania API
      // const response = await fetch("/api/v1/auth/reset-password", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ email })
      // });

      // eslint-disable-next-line no-console
      console.log("[ResetPasswordRequestForm] Żądanie resetu:", { email });

      // Symulacja opóźnienia
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // TODO: Obsługa odpowiedzi 429 (rate limit)
      // TODO: Wyświetlenie retry_after_seconds w UI

      setIsLoading(false);
      setSuccess(true);
    } catch (err) {
      setIsLoading(false);
      setError("Wystąpił błąd podczas wysyłania żądania. Spróbuj ponownie.");
      // eslint-disable-next-line no-console
      console.error("[ResetPasswordRequestForm] Error:", err);
    }
  };

  // Ekran sukcesu
  if (success) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <CircleCheck className="size-6 text-primary" />
          </div>
          <CardTitle className="text-center">Sprawdź swoją skrzynkę e-mail</CardTitle>
          <CardDescription className="text-center">
            Jeśli konto z tym adresem e-mail istnieje, wysłaliśmy instrukcje resetowania hasła.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          <Alert>
            <CircleAlert className="size-4" />
            <div className="ml-2">
              <p className="font-medium mb-2">Ważne informacje:</p>
              <ul className="text-sm space-y-1.5 list-disc list-inside">
                <li>Link do resetu hasła jest ważny przez 30 minut</li>
                <li>Sprawdź folder spam, jeśli nie widzisz wiadomości</li>
                <li>Możesz zamknąć tę stronę</li>
              </ul>
            </div>
          </Alert>
        </CardContent>

        <CardFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => (window.location.href = "/auth/login")}
          >
            Powrót do logowania
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit}>
        <CardHeader className="pb-4">
          <CardTitle>Resetuj hasło</CardTitle>
          <CardDescription>Wprowadź swój adres e-mail, a wyślemy Ci link do zresetowania hasła</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-0">
          {error && (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <div className="ml-2">{error}</div>
            </Alert>
          )}

          {rateLimitSeconds !== null && (
            <Alert>
              <CircleAlert className="size-4" />
              <div className="ml-2">
                <p className="font-medium">Zbyt wiele prób</p>
                <p className="text-sm mt-2">Spróbuj ponownie za {Math.ceil(rateLimitSeconds / 60)} minut</p>
              </div>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Adres e-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="twoj@email.pl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="email"
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 pt-2">
          <Button type="submit" className="w-full" disabled={isLoading || !email}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {isLoading ? "Wysyłanie..." : "Wyślij link resetujący"}
          </Button>

          <div className="text-sm text-center">
            <a href="/auth/login" className="text-muted-foreground hover:text-foreground transition-colors">
              Powrót do logowania
            </a>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
