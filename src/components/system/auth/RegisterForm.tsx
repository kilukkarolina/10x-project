import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";

/**
 * RegisterForm - formularz rejestracji
 *
 * Odpowiedzialności:
 * - Walidacja danych (e-mail, hasło zgodnie z polityką)
 * - Wyświetlanie wskazówek dotyczących wymagań hasła
 * - Obsługa błędów rejestracji
 * - Wyświetlenie ekranu sukcesu z instrukcją weryfikacji
 *
 * Note: Integracja z Supabase będzie dodana w kolejnym kroku
 */
export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Walidacja hasła w czasie rzeczywistym
  const passwordValidation = {
    minLength: password.length >= 10,
    hasLetter: /[A-Za-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    passwordsMatch: password === confirmPassword && password.length > 0,
  };

  const isPasswordValid = passwordValidation.minLength && passwordValidation.hasLetter && passwordValidation.hasDigit;

  const isFormValid = email && isPasswordValid && passwordValidation.passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // TODO: Implementacja rejestracji przez Supabase
      // const { data, error } = await supabase.auth.signUp({
      //   email,
      //   password,
      //   options: {
      //     emailRedirectTo: `${window.location.origin}/auth/verify`
      //   }
      // });

      // eslint-disable-next-line no-console
      console.log("[RegisterForm] Rejestracja:", { email });

      // Symulacja opóźnienia
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setIsLoading(false);
      setSuccess(true);
    } catch (err) {
      setIsLoading(false);
      setError("Wystąpił błąd podczas rejestracji. Spróbuj ponownie.");
      // eslint-disable-next-line no-console
      console.error("[RegisterForm] Error:", err);
    }
  };

  // Ekran sukcesu po rejestracji
  if (success) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <CircleCheck className="size-6 text-primary" />
          </div>
          <CardTitle className="text-center">Sprawdź swoją skrzynkę e-mail</CardTitle>
          <CardDescription className="text-center">
            Wysłaliśmy link weryfikacyjny na adres <strong>{email}</strong>
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          <Alert>
            <CircleAlert className="size-4" />
            <div className="ml-2">
              <p className="font-medium mb-2">Ważne informacje:</p>
              <ul className="text-sm space-y-1.5 list-disc list-inside">
                <li>Link weryfikacyjny jest ważny przez 30 minut</li>
                <li>Sprawdź folder spam, jeśli nie widzisz wiadomości</li>
                <li>Po weryfikacji będziesz mógł się zalogować</li>
              </ul>
            </div>
          </Alert>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => (window.location.href = "/auth/login")}
          >
            Przejdź do logowania
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Nie otrzymałeś e-maila?{" "}
            <a href="/auth/verify" className="text-primary hover:underline font-medium">
              Wyślij ponownie
            </a>
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit}>
        <CardHeader className="pb-4">
          <CardTitle>Utwórz konto</CardTitle>
          <CardDescription>Wprowadź swoje dane, aby rozpocząć korzystanie z FinFlow</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-0">
          {error && (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <div className="ml-2">{error}</div>
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

          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
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

        <CardFooter className="flex flex-col gap-4 pt-2">
          <Button type="submit" className="w-full" disabled={isLoading || !isFormValid}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {isLoading ? "Rejestracja..." : "Zarejestruj się"}
          </Button>

          <p className="text-sm text-center text-muted-foreground">
            Masz już konto?{" "}
            <a href="/auth/login" className="text-primary hover:underline font-medium">
              Zaloguj się
            </a>
          </p>
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
