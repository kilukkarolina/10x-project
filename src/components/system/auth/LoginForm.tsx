import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CircleAlert, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/db/supabase.browser";
import { LoginRequestSchema } from "@/lib/schemas/auth";
import { getCurrentMonth } from "@/lib/utils";

/**
 * LoginForm - formularz logowania
 *
 * Odpowiedzialności:
 * - Walidacja danych po stronie klienta (Zod)
 * - Logowanie przez Supabase Auth (signInWithPassword)
 * - Przekierowanie do /dashboard po sukcesie
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Client-side validation
      const validation = LoginRequestSchema.safeParse({ email, password });
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        setError(firstError.message);
        setIsLoading(false);
        return;
      }

      // Attempt to sign in
      const { error: signInError } = await supabaseBrowser.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password,
      });

      // Handle authentication errors
      if (signInError) {
        setError("Nieprawidłowy e-mail lub hasło");
        setIsLoading(false);
        return;
      }

      // Success - redirect to dashboard with current month parameter
      // This ensures proper UI initialization (dashboard requires ?month= param)
      toast.success("Zalogowano pomyślnie");
      window.location.href = `/dashboard?month=${getCurrentMonth()}`;
    } catch (err) {
      setIsLoading(false);
      setError("Wystąpił błąd podczas logowania. Spróbuj ponownie.");
      toast.error("Błąd połączenia z serwerem");
      // eslint-disable-next-line no-console
      console.error("[LoginForm] Error:", err);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} action="javascript:void(0)">
        <CardHeader className="pb-4">
          <CardTitle>Zaloguj się</CardTitle>
          <CardDescription>Wprowadź swoje dane, aby uzyskać dostęp do konta</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-0">
          {error && (
            <Alert variant="destructive" data-test-id="login-error-message">
              <CircleAlert className="size-4" />
              <div className="ml-2">{error}</div>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Adres e-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="twoj@email.pl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="email"
              data-test-id="login-email-input"
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
              name="password"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="current-password"
              data-test-id="login-password-input"
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 pt-2">
          <Button type="submit" className="w-full" disabled={isLoading} data-test-id="login-submit">
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
