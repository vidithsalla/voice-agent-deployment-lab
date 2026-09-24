import { requireOperator } from "@/lib/auth/operator";
import { NextResponse } from "next/server";
import { runVoiceAction } from "@/lib/actions/action-gateway";
import { badRequest, parseJson } from "@/lib/api";
import { checkVendorPaymentRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJson(request, checkVendorPaymentRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  return NextResponse.json(
    await runVoiceAction({
      interactionId: parsed.data.interactionId,
      callerPhone: parsed.data.callerPhone,
      transcript: parsed.data.transcript,
      idempotencyKey: parsed.data.idempotencyKey,
      overrideIntent: "check_vendor_payment",
      overrideFields: {
        vendorName: parsed.data.vendorName
      }
    })
  );
}
