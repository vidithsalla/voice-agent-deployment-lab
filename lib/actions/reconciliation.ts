import { createActionLog } from "@/lib/actions/audit";
import { createRequisition } from "@/lib/actions/requisitions";
import { buildNextStep } from "@/lib/actions/next-step";
import { getRepository } from "@/lib/db/repository";
import type { ActionLifecycleState } from "@/lib/db/types";
import type { ActionEnvelope } from "@/lib/schemas/actions";
import type { ExtractedFields } from "@/lib/simulator/extraction";

/**
 * Result of asking the downstream system whether a mutation with our correlation key exists.
 * The reconciliation outcome is always derived from this lookup; callers cannot supply it.
 */
export type DownstreamLookupResult =
  | { status: "found"; requisitionId: string }
  | { status: "not_found" }
  | { status: "unavailable" };

export type DownstreamLookup = (correlationKey: string) => Promise<DownstreamLookupResult>;

/** Mock ERP lookup: the mock's requisition table is queried by the idempotency/correlation key. */
export const mockErpLookup: DownstreamLookup = async (correlationKey) => {
  const existing = await getRepository().findRequisitionByIdempotency(correlationKey);
  return existing ? { status: "found", requisitionId: existing.id } : { status: "not_found" };
};

function readFields(value: Record<string, unknown> | null): ExtractedFields | null {
  const fields = value?.fields;
  return fields && typeof fields === "object" ? (fields as ExtractedFields) : null;
}

function readCallerUserId(value: Record<string, unknown> | null, fallback = "unknown") {
  return typeof value?.callerUserId === "string" ? value.callerUserId : fallback;
}

function operatorNextStep(input: {
  lifecycleState: ActionLifecycleState;
  outcome: string;
  actionRequestId: string;
}): ActionEnvelope["nextStep"] {
  return buildNextStep({
    policyDecision: "allowed",
    policy: { guardrails: [], reasons: [input.outcome], requiredClarifications: [] },
    lifecycleState: input.lifecycleState,
    outcome: input.outcome,
    actionRequestId: input.actionRequestId
  });
}

/**
 * `lookup` exists so tests can simulate an unavailable downstream. No route passes it, so runtime
 * callers cannot choose the outcome.
 */
export async function reconcileMaterialRequest(
  input: { actionRequestId: string; operatorUserId: string },
  lookup: DownstreamLookup = mockErpLookup
) {
  const repo = getRepository();
  const actionRequest = await repo.getActionRequestById(input.actionRequestId);
  if (!actionRequest) {
    return { ok: false, error: "action_request_not_found" as const };
  }

  if (actionRequest.actionName !== "create_material_request") {
    return { ok: false, error: "unsupported_action_for_reconciliation" as const, actionRequest };
  }

  if (actionRequest.lifecycleState === "succeeded" || actionRequest.lifecycleState === "recovered") {
    return {
      ok: true,
      replayed: true,
      actionRequest,
      nextStep: operatorNextStep({
        lifecycleState: actionRequest.lifecycleState,
        outcome: "Action request is already complete.",
        actionRequestId: actionRequest.id
      })
    };
  }

  if (
    actionRequest.lifecycleState !== "reconciliation_required" &&
    actionRequest.lifecycleState !== "failed_retryable"
  ) {
    return { ok: false, error: "invalid_reconciliation_state" as const, actionRequest };
  }

  const found = await lookup(actionRequest.idempotencyKey);
  const attemptRequest = {
    actionRequestId: actionRequest.id,
    operatorUserId: input.operatorUserId,
    correlationKey: actionRequest.idempotencyKey
  };

  if (found.status === "unavailable") {
    const outcome = "Reconciliation could not determine whether the downstream mutation occurred.";
    await repo.recordAdapterAttempt({
      orgId: actionRequest.orgId,
      actionRequestId: actionRequest.id,
      adapterName: "mock_erp",
      failureMode: "mutated_response_lost",
      status: "reconciliation_unresolved",
      requestPayload: attemptRequest,
      responsePayload: { simulated: true, reconciliationOutcome: "unknown", mutationConfirmed: "unknown" }
    });
    const updated = await repo.updateActionRequest(actionRequest.id, {
      lifecycleState: "human_review_required",
      resultPayload: { ...actionRequest.resultPayload, outcome, reconciledBy: input.operatorUserId },
      errorCode: "reconciliation_unresolved"
    });
    await createActionLog({
      orgId: actionRequest.orgId,
      interactionId: actionRequest.interactionId,
      actionName: "operator_reconciliation_unresolved",
      requestPayload: { actionRequestId: actionRequest.id, operatorUserId: input.operatorUserId },
      responsePayload: { outcome, nextStepDirective: "handoff_to_human" }
    });
    return {
      ok: false,
      actionRequest: updated ?? actionRequest,
      nextStep: operatorNextStep({ lifecycleState: "human_review_required", outcome, actionRequestId: actionRequest.id })
    };
  }

  if (found.status === "found") {
    const outcome = `Reconciliation found existing requisition ${found.requisitionId}; no retry was executed.`;
    await repo.recordAdapterAttempt({
      orgId: actionRequest.orgId,
      actionRequestId: actionRequest.id,
      adapterName: "mock_erp",
      failureMode: "mutated_response_lost",
      status: "reconciliation_found",
      requestPayload: attemptRequest,
      responsePayload: { simulated: true, reconciliationOutcome: "found", requisitionId: found.requisitionId }
    });
    const updated = await repo.updateActionRequest(actionRequest.id, {
      lifecycleState: "recovered",
      resultPayload: {
        ...actionRequest.resultPayload,
        requisitionId: found.requisitionId,
        outcome,
        reconciledBy: input.operatorUserId
      },
      errorCode: null
    });
    await createActionLog({
      orgId: actionRequest.orgId,
      interactionId: actionRequest.interactionId,
      actionName: "operator_reconciliation_found",
      requestPayload: { actionRequestId: actionRequest.id, operatorUserId: input.operatorUserId },
      responsePayload: { requisitionId: found.requisitionId, outcome, nextStepDirective: "continue" }
    });
    return {
      ok: true,
      actionRequest: updated ?? actionRequest,
      requisitionId: found.requisitionId,
      nextStep: operatorNextStep({ lifecycleState: "recovered", outcome, actionRequestId: actionRequest.id })
    };
  }

  const outcome = "Reconciliation found no downstream mutation; a retry is now safe.";
  await repo.recordAdapterAttempt({
    orgId: actionRequest.orgId,
    actionRequestId: actionRequest.id,
    adapterName: "mock_erp",
    failureMode: "timeout_before_mutation",
    status: "reconciliation_missing",
    requestPayload: attemptRequest,
    responsePayload: { simulated: true, reconciliationOutcome: "not_found", mutationConfirmed: false }
  });
  const updated = await repo.updateActionRequest(actionRequest.id, {
    lifecycleState: "failed_retryable",
    resultPayload: { ...actionRequest.resultPayload, outcome, reconciledBy: input.operatorUserId },
    errorCode: "safe_retry_available"
  });
  await createActionLog({
    orgId: actionRequest.orgId,
    interactionId: actionRequest.interactionId,
    actionName: "operator_reconciliation_missing",
    requestPayload: { actionRequestId: actionRequest.id, operatorUserId: input.operatorUserId },
    responsePayload: { outcome, nextStepDirective: "retry_later" }
  });
  return {
    ok: true,
    actionRequest: updated ?? actionRequest,
    nextStep: operatorNextStep({ lifecycleState: "failed_retryable", outcome, actionRequestId: actionRequest.id })
  };
}

export async function retrySafeMaterialRequest(
  input: { actionRequestId: string; operatorUserId: string },
  lookup: DownstreamLookup = mockErpLookup
) {
  const repo = getRepository();
  const actionRequest = await repo.getActionRequestById(input.actionRequestId);
  if (!actionRequest) {
    return { ok: false, error: "action_request_not_found" as const };
  }

  if (actionRequest.lifecycleState === "reconciliation_required") {
    return { ok: false, error: "reconciliation_required_before_retry" as const, actionRequest };
  }

  if (actionRequest.lifecycleState !== "failed_retryable") {
    return { ok: false, error: "invalid_retry_state" as const, actionRequest };
  }

  const fields = readFields(actionRequest.resultPayload);
  if (!fields) {
    return { ok: false, error: "retry_payload_missing" as const, actionRequest };
  }

  // Re-check downstream immediately before writing: if the mutation exists (or cannot be ruled
  // out) the retry must not execute; reconciliation decides what happens next.
  const downstream = await lookup(actionRequest.idempotencyKey);
  if (downstream.status !== "not_found") {
    return reconcileMaterialRequest(input, async () => downstream);
  }

  const claimed = await repo.transitionActionRequest(actionRequest.id, ["failed_retryable"], {
    lifecycleState: "executing"
  });
  if (!claimed) {
    return { ok: false, error: "invalid_retry_state" as const, actionRequest };
  }

  const requisition = await createRequisition({
    interactionId: actionRequest.interactionId,
    callerUserId: readCallerUserId(actionRequest.resultPayload),
    siteName: fields.siteName ?? "",
    materialName: fields.materialName ?? "",
    quantity: fields.quantity ?? 0,
    neededBy: fields.neededBy ?? "",
    idempotencyKey: actionRequest.idempotencyKey
  });

  if (!requisition) {
    // Nothing was written (unknown site/material), so returning to retryable is safe.
    await repo.updateActionRequest(actionRequest.id, { lifecycleState: "failed_retryable" });
    return { ok: false, error: "retry_requisition_not_created" as const, actionRequest };
  }

  const outcome = `Safe retry created requisition ${requisition.id}.`;
  await repo.recordAdapterAttempt({
    orgId: actionRequest.orgId,
    actionRequestId: actionRequest.id,
    adapterName: "mock_erp",
    failureMode: "none",
    status: "succeeded",
    requestPayload: { actionRequestId: actionRequest.id, operatorUserId: input.operatorUserId, fields },
    responsePayload: { mutationConfirmed: true, requisitionId: requisition.id }
  });
  const updated = await repo.updateActionRequest(actionRequest.id, {
    lifecycleState: "succeeded",
    resultPayload: {
      ...actionRequest.resultPayload,
      requisitionId: requisition.id,
      outcome,
      retriedBy: input.operatorUserId
    },
    errorCode: null
  });
  await createActionLog({
    orgId: actionRequest.orgId,
    interactionId: actionRequest.interactionId,
    actionName: "operator_safe_retry",
    requestPayload: { actionRequestId: actionRequest.id, operatorUserId: input.operatorUserId },
    responsePayload: { requisitionId: requisition.id, outcome, nextStepDirective: "continue" }
  });

  return {
    ok: true,
    actionRequest: updated ?? actionRequest,
    requisition,
    nextStep: operatorNextStep({ lifecycleState: "succeeded", outcome, actionRequestId: actionRequest.id })
  };
}
