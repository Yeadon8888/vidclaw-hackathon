import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let supabaseUser;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    supabaseUser = data.user;
  } catch (e) {
    console.error("[LAYOUT] Supabase getUser failed:", e);
    redirect("/login");
  }

  if (!supabaseUser) {
    redirect("/login");
  }

  let appUser;
  try {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.authId, supabaseUser.id))
      .limit(1);
    appUser = row;
  } catch (e) {
    console.error("[LAYOUT] DB user query failed:", e);
    throw new Error(`DB query failed: ${String(e).slice(0, 200)}`);
  }

  // Auto-create user record if not exists (e.g., first login after email confirmation)
  if (!appUser) {
    const allUsers = await db.select({ id: users.id }).from(users).limit(1);
    const isFirstUser = allUsers.length === 0;

    const [newUser] = await db
      .insert(users)
      .values({
        authId: supabaseUser.id,
        email: supabaseUser.email!,
        name: supabaseUser.email!.split("@")[0],
        role: isFirstUser ? "admin" : "user",
        credits: isFirstUser ? 9999 : 0,
      })
      .returning();

    appUser = newUser;
  }

  if (appUser.status !== "active") {
    redirect("/login?error=suspended");
  }

  return (
    <DashboardShell user={appUser}>
      {children}
    </DashboardShell>
  );
}
