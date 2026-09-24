import { requireOperator } from "@/lib/auth/operator";
import { NextResponse } from "next/server";
import { getBudgetStatus } from "@/lib/actions/budget";
import { badRequest, parseJson } from "@/lib/api";
import { checkBudgetRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJson(request, checkBudgetRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  return NextResponse.json({
    ok: true,
    budget: await getBudgetStatus(parsed.data)
  });
}
