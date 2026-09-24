import { NextResponse } from "next/server";
import { reconcileMaterialRequest } from "@/lib/actions/reconciliation";
import { requireOperator } from "@/lib/auth/operator";

// The outcome always comes from the downstream lookup; the request body is ignored on purpose.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const result = await reconcileMaterialRequest({ actionRequestId: id, operatorUserId: auth.actorId });

  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
