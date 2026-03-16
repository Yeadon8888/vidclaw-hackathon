import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthUser();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "admin") redirect("/generate");

  return <>{children}</>;
}
