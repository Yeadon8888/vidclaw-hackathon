/**
 * Supabase auth middleware for Next.js — best-practice implementation.
 *
 * Two defenses against the well-known "hang on tab refocus after idle"
 * class of bugs (see supabase/supabase#35754, #18981):
 *
 *   1. We call `supabase.auth.getUser()` — which revalidates against the
 *      Supabase Auth server — instead of `getSession()`. Official docs
 *      warn that `getSession()` in server code "isn't guaranteed to
 *      revalidate the Auth token".
 *
 *   2. We wrap that call in a 5-second Promise.race timeout. If the
 *      refresh-token flow deadlocks (the known upstream bug), we fall
 *      back to treating the request as unauthenticated AND scrub the
 *      Supabase session cookies on the response. The browser then sees
 *      "not logged in", the page redirects to /login, user re-logs in —
 *      worst case ~5s blip instead of a permanent dead tab.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

const GET_USER_TIMEOUT_MS = 5_000;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { user, authBroke } = await resolveUserSafely(supabase);

  const { pathname } = request.nextUrl;

  // Public routes that don't require auth (whitelist mode)
  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/gallery") ||
    pathname.startsWith("/landing-preview") ||
    pathname.startsWith("/design") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/refund") ||
    pathname.startsWith("/contact") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/gallery") ||
    pathname === "/api/health" ||
    pathname === "/api/announcements" ||
    pathname.startsWith("/api/internal/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/payments/stripe/webhook" ||
    pathname === "/api/payments/alipay/notify" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt";

  // If no user and not on public route → redirect to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // When auth itself broke (timeout / stale refresh token), tell /login
    // page so it can flash a short "session expired, please sign in again"
    // hint instead of a silent redirect.
    if (authBroke) {
      url.searchParams.set("session_expired", "1");
    }
    const redirect = NextResponse.redirect(url);
    if (authBroke) clearSupabaseCookies(request, redirect);
    return redirect;
  }

  // If user is on auth pages and already logged in → redirect to dashboard
  if (user && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/generate";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

interface AuthResult {
  user: User | null;
  /** True if resolution timed out or the refresh token was invalid — caller
   *  should scrub session cookies so the browser recovers on next load. */
  authBroke: boolean;
}

async function resolveUserSafely(
  supabase: ReturnType<typeof createServerClient>,
): Promise<AuthResult> {
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("supabase-auth-timeout")),
          GET_USER_TIMEOUT_MS,
        ),
      ),
    ]);

    if (result.error) {
      // Most common non-fatal: no session at all (user just hasn't logged in).
      if (result.error.name === "AuthSessionMissingError") {
        return { user: null, authBroke: false };
      }
      // Refresh-token failures, expired JWTs, etc. — treat as broken session.
      return { user: null, authBroke: true };
    }
    return { user: result.data.user ?? null, authBroke: false };
  } catch {
    // Timeout or network blip reaching Supabase Auth.
    return { user: null, authBroke: true };
  }
}

/**
 * Scrub Supabase session cookies off the response. `@supabase/ssr` writes
 * cookies prefixed with `sb-<projectRef>-auth-token` (may be chunked into
 * `.0`, `.1`). Wiping them all forces a clean re-login.
 */
function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) {
      response.cookies.set({
        name: cookie.name,
        value: "",
        maxAge: 0,
        path: "/",
      });
    }
  }
}
