import { requireOperator } from "@/lib/auth/operator";
import { NextResponse } from "next/server";
import { createActionLog, createWebhookEvent } from "@/lib/actions/audit";
import { resolveCaller } from "@/lib/actions/caller";
import { saveFollowup } from "@/lib/actions/followups";
import { badRequest, parseJson } from "@/lib/api";
import { sendFollowupRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJson(request, sendFollowupRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  const caller = await resolveCaller(parsed.data.callerPhone);
  const followup = await saveFollowup({
    orgId: caller?.orgId ?? "org-ventra",
    interactionId: parsed.data.interactionId,
    message: parsed.data.message
  });

  await createActionLog({
    orgId: caller?.orgId ?? "org-ventra",
    interactionId: parsed.data.interactionId,
    actionName: "send_followup_direct",
    requestPayload: parsed.data,
    responsePayload: { followupId: followup.id }
  });

  await createWebhookEvent({
    orgId: caller?.orgId ?? "org-ventra",
    interactionId: parsed.data.interactionId,
    actionName: "send_followup_direct",
    requestBody: parsed.data,
    responseBody: { followupId: followup.id }
  });

  return NextResponse.json({
    ok: true,
    followup
  });
}
