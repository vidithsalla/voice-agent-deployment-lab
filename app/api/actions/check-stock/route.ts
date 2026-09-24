import { requireOperator } from "@/lib/auth/operator";
import { NextResponse } from "next/server";
import { runVoiceAction } from "@/lib/actions/action-gateway";
import { badRequest, parseJson } from "@/lib/api";
import { checkStockRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJson(request, checkStockRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  const response = await runVoiceAction({
    interactionId: `check-stock-${crypto.randomUUID()}`,
    callerPhone: parsed.data.callerPhone,
    transcript: parsed.data.transcript,
    overrideIntent: "check_stock",
    overrideFields: {
      siteName: parsed.data.siteName,
      materialName: parsed.data.materialName
    }
  });

  return NextResponse.json(response);
}
