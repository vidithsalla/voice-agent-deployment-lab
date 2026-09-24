import { requireOperator } from "@/lib/auth/operator";
import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import { runEvalSuite } from "@/lib/eval/runner";

export async function POST(request: Request) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: false,
        error: "seed_evidence_disabled_with_database_url"
      },
      { status: 409 }
    );
  }

  await getRepository().resetAndSeed();
  const evalResult = await runEvalSuite();

  return NextResponse.json({
    ok: true,
    summary: evalResult.summary
  });
}
