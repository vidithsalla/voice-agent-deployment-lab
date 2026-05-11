import { NextResponse } from "next/server";
import { runVoiceAction } from "@/lib/actions/action-gateway";
import { badRequest, parseJson } from "@/lib/api";
import { createRequisitionRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const parsed = await parseJson(request, createRequisitionRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  const response = await runVoiceAction({
    interactionId: parsed.data.interactionId,
    callerPhone: parsed.data.callerPhone,
    transcript: parsed.data.transcript,
    idempotencyKey: parsed.data.idempotencyKey,
    overrideIntent: "create_material_request",
    overrideFields: {
      siteName: parsed.data.siteName,
      materialName: parsed.data.materialName,
      quantity: parsed.data.quantity,
      neededBy: parsed.data.neededBy,
      bypassAttempt: parsed.data.bypassApproval ?? false
    }
  });

  return NextResponse.json(response);
}
