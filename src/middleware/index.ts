import { defineMiddleware } from "astro:middleware";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../db/database.types";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * Parse cookies from raw header string
 * Astro context.cookies API może nie widzieć wszystkich cookies,
 * więc parsujemy je ręcznie z raw Cookie header
 */
function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce(
    (cookies, cookie) => {
      const [name, ...rest] = cookie.trim().split("=");
      if (name && rest.length > 0) {
        cookies[name] = rest.join("="); // Join back in case value contains '='
      }
      return cookies;
    },
    {} as Record<string, string>
  );
}

/**
 * Middleware - tworzy per-request Supabase client z obsługą cookies
 *
 * WAŻNE: Ten middleware tworzy NOWĄ instancję klienta dla każdego requestu,
 * która odczytuje auth cookies z przeglądarki. To umożliwia server-side
 * dostęp do sesji użytkownika.
 *
 * Flow:
 * 1. Request przychodzi z auth cookies (ustawione przez supabaseBrowser)
 * 2. Parsujemy cookies ręcznie z raw Cookie header (Astro API może nie widzieć wszystkich)
 * 3. createServerClient() odczytuje te cookies
 * 4. context.locals.supabase ma dostęp do sesji użytkownika
 * 5. AuthService.getUserId() działa poprawnie
 */
export const onRequest = defineMiddleware(async (context, next) => {
  // Parse cookies from raw header
  const cookieHeader = context.request.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);

  // Debug logging
  // eslint-disable-next-line no-console
  console.log(
    "[Middleware] Parsed cookies:",
    Object.keys(cookies).filter((k) => k.startsWith("sb-"))
  );

  // Twórz per-request Supabase client z cookies
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(key: string) {
        const value = cookies[key];
        if (!value) {
          // eslint-disable-next-line no-console
          console.log(`[Middleware] Cookie GET: ${key} = NULL`);
        }
        return value;
      },
      set(key: string, value: string, options: any) {
        // eslint-disable-next-line no-console
        console.log(`[Middleware] Cookie SET: ${key}`);
        context.cookies.set(key, value, options);
      },
      remove(key: string, options: any) {
        // eslint-disable-next-line no-console
        console.log(`[Middleware] Cookie REMOVE: ${key}`);
        context.cookies.delete(key, options);
      },
    },
  });

  // Debug: sprawdź sesję
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  // eslint-disable-next-line no-console
  console.log("[Middleware] Session check:", {
    hasSession: !!session,
    hasError: !!error,
    errorMessage: error?.message,
    userId: session?.user?.id,
  });

  context.locals.supabase = supabase;

  return next();
});
