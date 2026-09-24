import { requireOperator } from "@/lib/auth/operator";
import { NextResponse } from "next/server";
import { runVoiceAction } from "@/lib/actions/action-gateway";
import { badRequest, parseJson } from "@/lib/api";
import { checkPoStatusRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJson(request, checkPoStatusRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  return NextResponse.json(
    await runVoiceAction({
      interactionId: parsed.data.interactionId,
      callerPhone: parsed.data.callerPhone,
      transcript: parsed.data.transcript,
      idempotencyKey: parsed.data.idempotencyKey,
      overrideIntent: "check_po_status",
      overrideFields: {
        poCode: parsed.data.poCode
      }
    })
  );
}
