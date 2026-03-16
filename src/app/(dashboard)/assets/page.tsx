import { db } from "@/lib/db";
import { userAssets } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { AssetGrid } from "./AssetGrid";

export default async function AssetsPage() {
  const auth = await requireAuth();
  if (auth instanceof Response) return null;
  const user = auth.user;

  const assets = await db
    .select()
    .from(userAssets)
    .where(eq(userAssets.userId, user.id))
    .orderBy(desc(userAssets.createdAt))
    .limit(100);

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white sm:text-xl">参考图片</h1>
      </div>
      <AssetGrid initialAssets={assets} />
    </div>
  );
}
