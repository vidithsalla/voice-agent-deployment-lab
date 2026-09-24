import { requireOperator } from "@/lib/auth/operator";
import { NextResponse } from "next/server";
import { createActionLog, createGuardrailEvents, createWebhookEvent } from "@/lib/actions/audit";
import { requestApproval } from "@/lib/actions/approvals";
import { resolveCaller } from "@/lib/actions/caller";
import { findSiteByName } from "@/lib/actions/sites";
import { badRequest, parseJson } from "@/lib/api";
import { siteAccessAllowed } from "@/lib/policies/rules";
import { requestApprovalRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJson(request, requestApprovalRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  const caller = await resolveCaller(parsed.data.callerPhone);
  const site = await findSiteByName(parsed.data.siteName);

  if (!caller?.known) {
    await createGuardrailEvents({
      orgId: "org-ventra",
      interactionId: parsed.data.interactionId,
      guardrails: [
        {
          code: "unknown_caller",
          reason: "Unknown callers cannot create approval requests."
        }
      ]
    });

    return NextResponse.json(
      {
        ok: false,
        error: "unknown_caller"
      },
      { status: 403 }
    );
  }

  if (!site || !siteAccessAllowed(caller, site.id)) {
    await createGuardrailEvents({
      orgId: caller.orgId,
      interactionId: parsed.data.interactionId,
      guardrails: [
        {
          code: "site_access_denied",
          reason: "Caller does not have access to the requested site approval."
        }
      ]
    });

    return NextResponse.json(
      {
        ok: false,
        error: "site_access_denied"
      },
      { status: 403 }
    );
  }

  const approval = await requestApproval({
    interactionId: parsed.data.interactionId,
    callerUserId: caller.userId,
    siteName: parsed.data.siteName,
    reason: parsed.data.reason,
    idempotencyKey: parsed.data.idempotencyKey
  });

  if (approval) {
    await createActionLog({
      orgId: caller.orgId,
      interactionId: parsed.data.interactionId,
      actionName: "request_approval_direct",
      requestPayload: parsed.data,
      responsePayload: { approvalRequestId: approval.id }
    });

    await createWebhookEvent({
      orgId: caller.orgId,
      interactionId: parsed.data.interactionId,
      actionName: "request_approval_direct",
      requestBody: parsed.data,
      responseBody: { approvalRequestId: approval.id }
    });
  }

  return NextResponse.json({
    ok: Boolean(approval),
    approval
  });
}
