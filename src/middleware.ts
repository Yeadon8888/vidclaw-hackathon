import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Marketing surfaces that are localized under /[locale]/.
 * We intentionally DON'T localize dashboard, auth, api, blog, gallery, admin.
 */
const LOCALIZED_PREFIXES = ["/", "/pricing"];

function isLocalizedPath(pathname: string): boolean {
  // Only exact matches get localized. Paths like /pricing/result (Stripe
  // callback) are intentionally NOT localized — they stay under the
  // Supabase auth flow because they require a logged-in session.
  if (pathname === "/") return true;
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return true;
    for (const suffix of LOCALIZED_PREFIXES) {
      if (suffix === "/") continue;
      if (pathname === `/${locale}${suffix}`) return true;
    }
  }
  for (const suffix of LOCALIZED_PREFIXES) {
    if (suffix === "/") continue;
    if (pathname === suffix) return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isLocalizedPath(pathname)) {
    // next-intl handles locale detection + redirect (/ → /zh or /en)
    return intlMiddleware(request);
  }

  // All non-marketing paths run the existing Supabase auth flow unchanged
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image, favicon.ico
     * - public asset extensions
     * - sitemap / robots
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xml|txt|ico)$).*)",
  ],
};
