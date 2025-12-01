import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";

/**
 * UpdatePasswordForm - formularz ustawienia nowego hasła po resecie
 *
 * Odpowiedzialności:
 * - Wymiana tokenu z URL na sesję (exchangeCodeForSession)
 * - Walidacja nowego hasła (zgodnie z polityką)
 * - Wywołanie updateUser({ password })
 * - Obsługa błędów (nieprawidłowy/wygasły link)
 * - Przekierowanie do /auth/login po sukcesie
 *
 * Note: Integracja z Supabase będzie dodana w kolejnym kroku
 */
export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);

  // Walidacja hasła w czasie rzeczywistym
  const passwordValidation = {
    minLength: password.length >= 10,
    hasLetter: /[A-Za-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    passwordsMatch: password === confirmPassword && password.length > 0,
  };

  const isPasswordValid = passwordValidation.minLength && passwordValidation.hasLetter && passwordValidation.hasDigit;

  const isFormValid = isPasswordValid && passwordValidation.passwordsMatch;

  // Sprawdź kod w URL przy montowaniu
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      setInvalidLink(true);
      return;
    }

    // TODO: Wymiana kodu na sesję
    // const { error } = await supabase.auth.exchangeCodeForSession(code);
    // if (error) {
    //   setInvalidLink(true);
    // }

    // eslint-disable-next-line no-console
    console.log("[UpdatePasswordForm] Kod z URL:", code);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // TODO: Implementacja zmiany hasła przez Supabase
      // const { error } = await supabase.auth.updateUser({ password });

      // eslint-disable-next-line no-console
      console.log("[UpdatePasswordForm] Zmiana hasła");

      // Symulacja opóźnienia
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setIsLoading(false);
      setSuccess(true);

      // Przekierowanie po 2 sekundach
      setTimeout(() => {
        window.location.href = "/auth/login";
      }, 2000);
    } catch (err) {
      setIsLoading(false);
      setError("Wystąpił błąd podczas zmiany hasła. Spróbuj ponownie.");
      // eslint-disable-next-line no-console
      console.error("[UpdatePasswordForm] Error:", err);
    }
  };

  // Link nieprawidłowy/wygasły
  if (invalidLink) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="pb-4">
          <CardTitle className="text-center">Link wygasł lub jest nieprawidłowy</CardTitle>
          <CardDescription className="text-center">
            Link do resetowania hasła jest już nieaktualny lub został użyty
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          <Alert>
            <CircleAlert className="size-4" />
            <div className="ml-2">
              <p className="text-sm">
                Linki resetujące hasło są ważne tylko przez 30 minut i mogą być użyte tylko raz.
              </p>
            </div>
          </Alert>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button type="button" className="w-full" onClick={() => (window.location.href = "/auth/reset-password")}>
            Wygeneruj nowy link
          </Button>
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

  // Ekran sukcesu
  if (success) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <CircleCheck className="size-6 text-primary" />
          </div>
          <CardTitle className="text-center">Hasło zostało zmienione</CardTitle>
          <CardDescription className="text-center">Możesz teraz zalogować się używając nowego hasła</CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          <Alert>
            <CircleAlert className="size-4" />
            <div className="ml-2">
              <p className="text-sm">Za chwilę zostaniesz przekierowany do strony logowania...</p>
            </div>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit}>
        <CardHeader className="pb-4">
          <CardTitle>Ustaw nowe hasło</CardTitle>
          <CardDescription>Wprowadź nowe hasło dla swojego konta</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-0">
          {error && (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <div className="ml-2">{error}</div>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">Nowe hasło</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
            {/* Wskazówki dotyczące hasła */}
            {password && (
              <div className="space-y-1.5 text-sm mt-3">
                <PasswordRequirement met={passwordValidation.minLength} label="Minimum 10 znaków" />
                <PasswordRequirement met={passwordValidation.hasLetter} label="Co najmniej jedna litera" />
                <PasswordRequirement met={passwordValidation.hasDigit} label="Co najmniej jedna cyfra" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Powtórz hasło</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
            {confirmPassword && !passwordValidation.passwordsMatch && (
              <p className="text-sm text-destructive">Hasła muszą być identyczne</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="pt-2">
          <Button type="submit" className="w-full" disabled={isLoading || !isFormValid}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {isLoading ? "Zmiana hasła..." : "Zmień hasło"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/**
 * PasswordRequirement - komponent pomocniczy do wyświetlania wymagań hasła
 */
function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${met ? "text-green-600" : "text-muted-foreground"}`}>
      <div className={`size-1.5 rounded-full ${met ? "bg-green-600" : "bg-muted-foreground"}`} />
      <span>{label}</span>
    </div>
  );
}
