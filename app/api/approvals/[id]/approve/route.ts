import { NextResponse } from "next/server";
import { approveMaterialRequest } from "@/lib/actions/approvals";
import { requireOperator } from "@/lib/auth/operator";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const result = await approveMaterialRequest({ approvalRequestId: id, operatorUserId: auth.actorId });

  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
