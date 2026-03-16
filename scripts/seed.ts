/**
 * Seed script — populate models table with default video generation models.
 * Run: npm run db:seed  (requires DATABASE_URL in .env.local)
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { models } from "../src/lib/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(DATABASE_URL, { prepare: false });
const db = drizzle(client);

const defaultModels = [
  {
    name: "VEO 3.1 Fast",
    slug: "veo3.1-fast",
    provider: "plato",
    creditsPerGen: 5,
    sortOrder: 0,
  },
  {
    name: "VEO 3.1 Components",
    slug: "veo3.1-components",
    provider: "plato",
    creditsPerGen: 8,
    sortOrder: 1,
  },
  {
    name: "VEO 3.1 Pro 4K",
    slug: "veo3.1-pro-4k",
    provider: "plato",
    creditsPerGen: 15,
    sortOrder: 2,
  },
  {
    name: "Sora",
    slug: "sora",
    provider: "plato",
    creditsPerGen: 10,
    sortOrder: 3,
  },
];

async function seed() {
  console.log("🌱 Seeding models...");

  for (const m of defaultModels) {
    await db
      .insert(models)
      .values(m)
      .onConflictDoNothing({ target: models.slug });
    console.log(`  ✓ ${m.name} (${m.slug})`);
  }

  console.log("✅ Seed complete.");
  await client.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
