import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { runVoiceAction } from "@/lib/actions/action-gateway";
import { postgresEnabled } from "@/lib/db/client";
import { getRepository } from "@/lib/db/repository";

function writeReport(markdown: string) {
  fs.writeFileSync(path.join(process.cwd(), "docs", "postgres-verification.md"), `${markdown}\n`);
}

async function main() {
  if (!postgresEnabled()) {
    const message = "DATABASE_URL not set. Postgres verification skipped. In-memory fallback remains verified.";
    writeReport(`# Postgres Verification

- Status: skipped
- Reason: ${message}
- Reproduce: set \`DATABASE_URL\`, run \`npm run db:push\`, \`npm run db:seed\`, then \`npm run verify:db\`
`);
    console.log(message);
    return;
  }

  if (process.env.ALLOW_DESTRUCTIVE_DB_RESET !== "1") {
    console.error(
      "verify:db pushes the schema and DELETES ALL ROWS in DATABASE_URL before reseeding. " +
        "Use a disposable database and re-run with ALLOW_DESTRUCTIVE_DB_RESET=1."
    );
    process.exitCode = 1;
    return;
  }

  execSync("npx drizzle-kit push", { stdio: "inherit" });
  const repo = getRepository("postgres");
  await repo.resetAndSeed();

  const interactionId = `db-verify-${crypto.randomUUID()}`;
  const result = await runVoiceAction({
    interactionId,
    callerPhone: "+15550000001",
    transcript: "This is Raj from Site A. We need 40 bags of cement tomorrow morning.",
    idempotencyKey: interactionId
  });

  const reloadedRepo = getRepository("postgres");
  const [interaction, requisitions] = await Promise.all([
    reloadedRepo.getInteractionById(interactionId),
    reloadedRepo.listRequisitionsByInteraction(interactionId)
  ]);

  writeReport(`# Postgres Verification

- Status: ${interaction && requisitions.length > 0 ? "passed" : "failed"}
- Commands:
  - \`npx drizzle-kit push\`
  - \`npm run db:seed\`
  - \`npm run verify:db\`
- Interaction persisted: ${interaction ? "yes" : "no"}
- Requisition rows found: ${requisitions.length}
- Policy decision: ${result.policyDecision}
- Limitations: this verifies repository persistence, not external telecom delivery.
`);

  console.log(interaction && requisitions.length > 0 ? "Postgres verification passed." : "Postgres verification failed.");
  if (!interaction || requisitions.length === 0) {
    process.exitCode = 1;
  }
}

void main();
