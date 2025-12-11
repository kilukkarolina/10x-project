import { useEffect, useState } from "react";
import { Loader2, Mail, CheckCircle2, XCircle, Calendar, LogIn } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { supabaseBrowser } from "@/db/supabase.browser";
import type { User } from "@supabase/supabase-js";

/**
 * ProfileApp - widok profilu użytkownika
 *
 * Odpowiedzialności:
 * - Pobieranie danych użytkownika z Supabase Auth
 * - Wyświetlanie informacji o profilu (email, status weryfikacji, daty)
 * - Obsługa stanów: loading, error
 */
export function ProfileApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
          error: authError,
        } = await supabaseBrowser.auth.getUser();

        if (authError) {
          throw new Error(authError.message);
        }

        if (!user) {
          throw new Error("Nie znaleziono danych użytkownika");
        }

        setUser(user);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Nie udało się pobrać danych profilu";
        setError(message);
        // eslint-disable-next-line no-console
        console.error("[ProfileApp] Error fetching user data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !user) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container mx-auto">
          <Alert variant="destructive">
            <div className="ml-2">{error || "Nie można załadować danych profilu"}</div>
          </Alert>
        </div>
      </div>
    );
  }

  // Format dates to Polish format with time: "15 stycznia 2025, 10:30"
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "—";

    try {
      const date = new Date(dateString);

      // Check if date is valid
      if (isNaN(date.getTime())) return "—";

      // Polish month names
      const monthNames = [
        "stycznia",
        "lutego",
        "marca",
        "kwietnia",
        "maja",
        "czerwca",
        "lipca",
        "sierpnia",
        "września",
        "października",
        "listopada",
        "grudnia",
      ];

      const day = date.getDate();
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");

      return `${day} ${month} ${year}, ${hours}:${minutes}`;
    } catch {
      return "—";
    }
  };

  const isEmailVerified = !!user.email_confirmed_at;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Moje konto</h1>
          <p className="mt-2 text-muted-foreground">Informacje o Twoim profilu</p>
        </header>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle>Dane konta</CardTitle>
            <CardDescription>Podstawowe informacje o Twoim koncie</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email */}
            <div className="flex items-start gap-3">
              <Mail className="size-5 text-muted-foreground mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Adres e-mail</p>
                <p className="mt-1 text-base">{user.email || "—"}</p>
              </div>
            </div>

            {/* Email Verification Status */}
            <div className="flex items-start gap-3">
              {isEmailVerified ? (
                <CheckCircle2 className="size-5 text-green-600 mt-0.5" aria-hidden="true" />
              ) : (
                <XCircle className="size-5 text-orange-600 mt-0.5" aria-hidden="true" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Status weryfikacji e-mail</p>
                <p className="mt-1 text-base">
                  {isEmailVerified ? (
                    <span className="text-green-600 font-medium">Potwierdzony</span>
                  ) : (
                    <span className="text-orange-600 font-medium">Niepotwierdzony</span>
                  )}
                </p>
              </div>
            </div>

            {/* Created At */}
            <div className="flex items-start gap-3">
              <Calendar className="size-5 text-muted-foreground mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Data utworzenia konta</p>
                <p className="mt-1 text-base">{formatDate(user.created_at)}</p>
              </div>
            </div>

            {/* Last Sign In */}
            <div className="flex items-start gap-3">
              <LogIn className="size-5 text-muted-foreground mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Data ostatniego logowania</p>
                <p className="mt-1 text-base">{formatDate(user.last_sign_in_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
