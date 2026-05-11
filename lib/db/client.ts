import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";

declare global {
  var __VOICE_AGENT_PG_POOL__: Pool | undefined;
}

export function postgresEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPostgresDb() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!globalThis.__VOICE_AGENT_PG_POOL__) {
    globalThis.__VOICE_AGENT_PG_POOL__ = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }

  return drizzle(globalThis.__VOICE_AGENT_PG_POOL__, { schema });
}
