import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Use connection pooling for serverless environments
const client = postgres(connectionString, {
  prepare: false, // Required for Supabase transaction pooler
  max: 3,         // Limit connections to avoid exhausting Supabase pool
  idle_timeout: 20,
});

export const db = drizzle(client, { schema });
