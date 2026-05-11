import { seedDatabase } from "@/lib/db/seed-data";
import type { DemoDatabase } from "@/lib/db/types";

function cloneDatabase(): DemoDatabase {
  return JSON.parse(JSON.stringify(seedDatabase)) as DemoDatabase;
}

declare global {
  var __VOICE_AGENT_DEMO_DB__: DemoDatabase | undefined;
}

export function getDemoDb(): DemoDatabase {
  if (!globalThis.__VOICE_AGENT_DEMO_DB__) {
    globalThis.__VOICE_AGENT_DEMO_DB__ = cloneDatabase();
  }

  return globalThis.__VOICE_AGENT_DEMO_DB__;
}

export function resetDemoDb(): DemoDatabase {
  globalThis.__VOICE_AGENT_DEMO_DB__ = cloneDatabase();
  return globalThis.__VOICE_AGENT_DEMO_DB__;
}
