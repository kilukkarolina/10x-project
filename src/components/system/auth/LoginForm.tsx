import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CircleAlert, Loader2 } from "lucide-react";

// interface LoginFormProps {
//   onResendVerification?: () => void;
// }

/**
 * LoginForm - formularz logowania
 *
 * Odpowiedzialności:
 * - Walidacja danych po stronie klienta
 * - Obsługa błędów logowania
 * - Obsługa nieweryfikowanego konta z CTA "Wyślij ponownie"
 * - Przekierowanie do /dashboard po sukcesie
 *
 * Note: Integracja z Supabase będzie dodana w kolejnym kroku
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setIsLoading(true);

    try {
      // TODO: Implementacja logowania przez Supabase
      // const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      // eslint-disable-next-line no-console
      console.log("[LoginForm] Logowanie:", { email });

      // Symulacja opóźnienia
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // TODO: Obsługa błędu email_not_confirmed
      // TODO: Sprawdzenie user.email_confirmed_at
      // TODO: Przekierowanie do /dashboard

      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
      setError("Wystąpił błąd podczas logowania. Spróbuj ponownie.");
      // eslint-disable-next-line no-console
      console.error("[LoginForm] Error:", err);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit}>
        <CardHeader className="pb-4">
          <CardTitle>Zaloguj się</CardTitle>
          <CardDescription>Wprowadź swoje dane, aby uzyskać dostęp do konta</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-0">
          {error && (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <div className="ml-2">{error}</div>
            </Alert>
          )}

          {needsVerification && (
            <Alert>
              <CircleAlert className="size-4" />
              <div className="ml-2 space-y-3">
                <p className="font-medium">Zweryfikuj adres e-mail</p>
                <p className="text-sm">Musisz potwierdzić swój adres e-mail przed zalogowaniem.</p>
                <a href="/auth/verify" className="text-sm text-primary hover:underline font-medium inline-block">
                  Wyślij link ponownie
                </a>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Hasło</Label>
              <a
                href="/auth/reset-password"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Nie pamiętasz hasła?
              </a>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="current-password"
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 pt-2">
          <Button type="submit" className="w-full" disabled={isLoading || !email || !password}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {isLoading ? "Logowanie..." : "Zaloguj się"}
          </Button>

          <p className="text-sm text-center text-muted-foreground">
            Nie masz konta?{" "}
            <a href="/auth/register" className="text-primary hover:underline font-medium">
              Zarejestruj się
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
