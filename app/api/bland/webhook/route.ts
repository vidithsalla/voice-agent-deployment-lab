import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api";
import { BLAND_WEBHOOK_SECRET_HEADER, handleBlandWebhook, verifyBlandWebhookSecret } from "@/lib/bland/adapter";
import { blandWebhookRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  if (!verifyBlandWebhookSecret(request.headers.get(BLAND_WEBHOOK_SECRET_HEADER))) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ code: "invalid_webhook_secret", message: "Webhook secret verification failed." }]
      },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest([{ code: "invalid_json", message: "Request body is not valid JSON." }]);
  }

  const parsed = blandWebhookRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "bad_request",
        speak: "I could not verify the caller and request details.",
        interaction_id: typeof body === "object" && body && "call_id" in body ? body.call_id : "unknown",
        action_id: "none",
        guardrails: ["invalid_bland_payload"],
        required_clarifications: ["caller_phone", "transcript"],
        next_step: {
          directive: "clarify",
          reason_code: "MISSING_REQUIRED_FIELDS",
          required_fields: ["caller_phone", "transcript"],
          safe_explanation: "Required caller or transcript data was missing or invalid.",
          operator_intervention_required: false,
          can_retry: false,
          can_reconcile: false,
          context: {}
        },
        errors: [{ code: "invalid_request", message: parsed.error.message }]
      },
      { status: 400 }
    );
  }

  return NextResponse.json(await handleBlandWebhook(parsed.data));
}
