import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

/** GET /api/health — diagnostic endpoint */
export async function GET() {
  const checks: Record<string, string> = {};

  // Check env vars
  checks.DATABASE_URL = process.env.DATABASE_URL ? "set" : "MISSING";
  checks.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "MISSING";
  checks.SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "set" : "MISSING";

  // Test Supabase auth
  try {
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    checks.supabase_auth = authError ? `error: ${authError.message}` : data.user ? "ok" : "no_user";
  } catch (e) {
    checks.supabase_auth = `exception: ${String(e).slice(0, 100)}`;
  }

  // Test DB connection
  try {
    const result = await db.execute(sql`SELECT 1 as ok`);
    checks.db_connection = "ok";
  } catch (e) {
    const err = e as { cause?: unknown };
    checks.db_connection = `error: ${String(e).slice(0, 200)}`;
    checks.db_cause = err.cause ? String(err.cause).slice(0, 200) : "no cause";
    checks.db_url_prefix = process.env.DATABASE_URL?.slice(0, 40) ?? "empty";
  }

  // Test users table
  try {
    const count = await db.select({ id: users.id }).from(users).limit(1);
    checks.users_table = `ok (${count.length} rows)`;
  } catch (e) {
    checks.users_table = `error: ${String(e).slice(0, 200)}`;
  }

  return NextResponse.json(checks);
}
