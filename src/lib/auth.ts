import { NextResponse } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { User } from "@/lib/db/schema";

export interface AuthContext {
  user: User;
  supabaseUserId: string;
}

/**
 * Authenticate the current request and return the app user.
 * Wrapped with React cache() so multiple calls within the same
 * request/render (e.g. layout + page) only hit Supabase + DB once.
 * Returns null if not authenticated.
 */
export const getAuthUser = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();
  const { data: { user: supabaseUser } } = await supabase.auth.getUser();

  if (!supabaseUser) return null;

  const [appUser] = await db
    .select()
    .from(users)
    .where(eq(users.authId, supabaseUser.id))
    .limit(1);

  if (!appUser) return null;
  if (appUser.status !== "active") return null;

  return { user: appUser, supabaseUserId: supabaseUser.id };
});

/**
 * Require auth — returns 401 response if not authenticated.
 */
export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return ctx;
}

/**
 * Require admin role — returns 403 if not admin.
 */
export async function requireAdmin(): Promise<AuthContext | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (result.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}
