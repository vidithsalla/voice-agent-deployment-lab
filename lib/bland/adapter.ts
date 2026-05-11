import type { ActionEnvelope } from "@/lib/schemas/actions";
import { runVoiceAction } from "@/lib/actions/action-gateway";
import type { BlandVariables } from "@/lib/extraction/types";

export interface BlandWebhookPayload {
  call_id: string;
  caller_phone: string;
  transcript: string;
  variables?: BlandVariables;
  metadata?: {
    pathway_id?: string;
    node_id?: string;
  };
}

export function blandIntegrationEnabled() {
  return true;
}

export function verifyBlandWebhookSecret(signature: string | null) {
  const configuredSecret = process.env.BLAND_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return true;
  }

  return Boolean(signature) && signature === configuredSecret;
}

export function formatBlandWebhookResponse(result: ActionEnvelope) {
  const status =
    result.policyDecision === "approval_required"
      ? "approval_required"
      : result.policyDecision === "clarification_needed"
        ? "clarification_needed"
        : result.policyDecision === "blocked"
          ? "blocked"
          : result.relatedRecords.siteIssueId
            ? "escalated"
            : "success";

  return {
    status,
    speak: result.data.followupMessage,
    interaction_id: result.interactionId,
    action_id: result.action,
    guardrails: result.guardrails.map((item) => item.code),
    required_clarifications: result.policy.requiredClarifications ?? []
  };
}

export async function handleBlandWebhook(payload: BlandWebhookPayload) {
  const result = await runVoiceAction({
    interactionId: payload.call_id,
    callerPhone: payload.caller_phone,
    transcript: payload.transcript,
    idempotencyKey: payload.call_id,
    extractionMode: "bland_variables",
    blandVariables: payload.variables,
    sourceMetadata: payload.metadata
  });

  return formatBlandWebhookResponse(result);
}
