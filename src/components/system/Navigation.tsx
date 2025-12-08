import { useState } from "react";
import { LayoutDashboard, Coins, Target, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/db/supabase.browser";

interface NavigationProps {
  currentPath: string;
}

/**
 * Navigation - główne menu nawigacyjne aplikacji
 *
 * Wyświetlane na wszystkich stronach, pokazuje aktywną pozycję
 * Zawiera przycisk wylogowania w prawym górnym rogu (US-003)
 */
export function Navigation({ currentPath }: NavigationProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      const { error } = await supabaseBrowser.auth.signOut();

      if (error) {
        toast.error("Nie udało się wylogować. Spróbuj ponownie.");
        setIsLoggingOut(false);
        return;
      }

      // Successful logout - redirect to login page
      toast.success("Wylogowano pomyślnie");
      window.location.href = "/auth/login";
    } catch (err) {
      toast.error("Wystąpił błąd podczas wylogowania");
      setIsLoggingOut(false);
      // eslint-disable-next-line no-console
      console.error("[Navigation] Logout error:", err);
    }
  };
  const navItems = [
    {
      label: "Podsumowanie",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Transakcje",
      href: "/transactions",
      icon: Coins,
    },
    {
      label: "Cele",
      href: "/goals",
      icon: Target,
    },
  ];

  const isActive = (href: string) => {
    // Dokładne dopasowanie dla /dashboard
    if (href === "/dashboard") {
      return currentPath === "/dashboard" || currentPath === "/";
    }
    // Dla pozostałych - sprawdź czy path zaczyna się od href
    return currentPath.startsWith(href);
  };

  return (
    <nav className="border-b bg-background" role="navigation" aria-label="Główna nawigacja">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-6 h-16">
          {/* Logo/Nazwa aplikacji */}
          <div className="flex items-center gap-2 mr-4">
            <LayoutDashboard className="size-6 text-primary" aria-hidden="true" />
            <span className="font-semibold text-lg hidden sm:inline">FinFlow</span>
          </div>

          {/* Menu items */}
          <ul className="flex items-center gap-1 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors
                      ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }
                    `}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>

          {/* Logout button - prawy górny róg */}
          <div className="ml-auto">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Wyloguj się"
              data-test-id="logout-button"
            >
              {isLoggingOut ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="size-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{isLoggingOut ? "Wylogowywanie..." : "Wyloguj"}</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
