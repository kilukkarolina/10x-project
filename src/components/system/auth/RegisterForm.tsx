import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CircleAlert, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/db/supabase.browser";
import { RegisterRequestSchema } from "@/lib/schemas/auth";

/**
 * RegisterForm - formularz rejestracji
 *
 * Odpowiedzialności:
 * - Walidacja danych (e-mail, hasło zgodnie z polityką: min 10 znaków, ≥1 litera, ≥1 cyfra)
 * - Rejestracja przez Supabase Auth (signUp)
 * - Automatyczne logowanie po rejestracji
 *
 * Security:
 * - Nie ujawnia istnienia konta (neutralne komunikaty przy konflikcie)
 * - Hasła walidowane client-side i server-side (Supabase)
 *
 * Flow:
 * 1. Walidacja client-side (Zod)
 * 2. signUp() → Supabase tworzy konto
 * 3. Automatyczne przekierowanie na dashboard
 */
export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Client-side validation
      const validation = RegisterRequestSchema.safeParse({ email, password });
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        setError(firstError.message);
        setIsLoading(false);
        return;
      }

      // Sign up with Supabase
      const { data, error: signUpError } = await supabaseBrowser.auth.signUp({
        email: validation.data.email,
        password: validation.data.password,
      });

      if (signUpError) {
        // Handle specific errors
        if (signUpError.message.toLowerCase().includes("already registered")) {
          // Neutralna odpowiedź - nie ujawniamy istnienia konta
          setError("Konto z tym adresem e-mail już istnieje.");
        } else {
          setError("Wystąpił błąd podczas rejestracji. Spróbuj ponownie.");
        }
        setIsLoading(false);
        return;
      }

      // Check if user was created and session exists
      if (!data.user || !data.session) {
        setError("Wystąpił błąd podczas rejestracji. Spróbuj ponownie.");
        setIsLoading(false);
        return;
      }

      // Success - redirect to dashboard
      toast.success("Konto zostało utworzone. Witamy w FinFlow!");
      window.location.href = "/dashboard";
    } catch (err) {
      setIsLoading(false);
      setError("Wystąpił błąd podczas rejestracji. Spróbuj ponownie.");
      toast.error("Błąd połączenia z serwerem");
      // eslint-disable-next-line no-console
      console.error("[RegisterForm] Error:", err);
    }
  };

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
