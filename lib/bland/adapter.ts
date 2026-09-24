import crypto from "node:crypto";
import type { ActionEnvelope } from "@/lib/schemas/actions";
import { runVoiceAction } from "@/lib/actions/action-gateway";
import type { BlandVariables } from "@/lib/extraction/types";

export interface BlandWebhookPayload {
  call_id: string;
  caller_phone?: string;
  from?: string;
  transcript?: string;
  lastUserMessage?: string;
  variables?: BlandVariables;
  request_data?: Record<string, unknown>;
  metadata?: {
    pathway_id?: string;
    pathway_version?: number;
    node_id?: string;
    customer_key?: string;
    deployment_id?: string;
  };
  pathway_id?: string;
  pathway_version?: number;
  node_id?: string;
}

export const BLAND_WEBHOOK_SECRET_HEADER = "x-bland-webhook-secret";

/**
 * The only supported mechanism is a raw shared secret in `x-bland-webhook-secret`, which is the
 * header verified end-to-end from a Bland Webhook node. With no secret configured, requests are
 * accepted only outside production (local development and tests).
 */
export function verifyBlandWebhookSecret(headerValue: string | null) {
  const configuredSecret = process.env.BLAND_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  if (!headerValue) {
    return false;
  }

  return timingSafeEqualString(headerValue, configuredSecret);
}

function timingSafeEqualString(left: string, right: string) {
  const digest = (value: string) => crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(digest(left), digest(right));
}

export function formatBlandWebhookResponse(result: ActionEnvelope) {
  const status =
    result.errors.length > 0
      ? result.data.actionRequest &&
        typeof result.data.actionRequest === "object" &&
        "lifecycleState" in result.data.actionRequest &&
        result.data.actionRequest.lifecycleState === "reconciliation_required"
        ? "reconciliation_required"
        : result.data.actionRequest &&
          typeof result.data.actionRequest === "object" &&
          "lifecycleState" in result.data.actionRequest &&
          result.data.actionRequest.lifecycleState === "human_review_required"
          ? "human_review_required"
          : result.data.actionRequest &&
            typeof result.data.actionRequest === "object" &&
            "lifecycleState" in result.data.actionRequest &&
        result.data.actionRequest.lifecycleState === "failed_retryable"
        ? "retryable_failure"
        : "failed"
      : result.policyDecision === "approval_required"
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
    required_clarifications: result.policy.requiredClarifications ?? [],
    next_step: {
      directive: result.nextStep.directive,
      reason_code: result.nextStep.reasonCode,
      required_fields: result.nextStep.requiredFields,
      safe_explanation: result.nextStep.safeExplanation,
      action_request_id: result.nextStep.actionRequestId,
      approval_request_id: result.nextStep.approvalRequestId,
      operator_intervention_required: result.nextStep.operatorInterventionRequired,
      can_retry: result.nextStep.canRetry,
      can_reconcile: result.nextStep.canReconcile,
      context: result.nextStep.context
    }
  };
}

export async function handleBlandWebhook(payload: BlandWebhookPayload) {
  const callerPhone = payload.caller_phone ?? payload.from;
  const transcript = payload.transcript ?? payload.lastUserMessage;
  if (!callerPhone || !transcript) {
    return {
      status: "bad_request",
      speak: "I could not verify the caller and request details.",
      interaction_id: payload.call_id,
      action_id: "none",
      guardrails: ["invalid_bland_payload"],
      required_clarifications: ["caller_phone", "transcript"],
      next_step: {
        directive: "clarify",
        reason_code: "MISSING_REQUIRED_FIELDS",
        required_fields: ["caller_phone", "transcript"],
        safe_explanation: "Required caller or transcript data was missing.",
        operator_intervention_required: false,
        can_retry: false,
        can_reconcile: false,
        context: {}
      }
    };
  }

  const customerConfigKey =
    typeof payload.request_data?.customer_key === "string"
      ? payload.request_data.customer_key
      : payload.metadata?.customer_key;

  const sourceMetadata: Record<string, unknown> = {
    ...payload.request_data,
    ...payload.metadata,
    pathway_id: payload.metadata?.pathway_id ?? payload.pathway_id,
    pathway_version: payload.metadata?.pathway_version ?? payload.pathway_version,
    node_id: payload.metadata?.node_id ?? payload.node_id
  };
  // Failure injection is a demo/test facility; the webhook never accepts it from the caller.
  delete sourceMetadata.failureMode;
  delete sourceMetadata.failure_mode;

  const result = await runVoiceAction({
    interactionId: payload.call_id,
    callerPhone,
    transcript,
    idempotencyKey: payload.call_id,
    scopeIdempotencyToPayload: true,
    customerKeyRequired: true,
    extractionMode: "bland_variables",
    blandVariables: payload.variables,
    customerConfigKey,
    sourceMetadata
  });

  return formatBlandWebhookResponse(result);
}
