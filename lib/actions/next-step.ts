import type { ActionLifecycleState } from "@/lib/db/types";
import type { ActionEnvelope } from "@/lib/schemas/actions";
import type { PolicyResult } from "@/lib/policies/types";

type NextStep = ActionEnvelope["nextStep"];

export function buildNextStep(input: {
  policyDecision: ActionEnvelope["policyDecision"];
  policy: Pick<PolicyResult, "guardrails" | "requiredClarifications" | "reasons">;
  lifecycleState: ActionLifecycleState;
  outcome: string;
  actionRequestId?: string;
  approvalRequestId?: string;
  intent?: ActionEnvelope["intent"];
}): NextStep {
  const base = {
    requiredFields: input.policy.requiredClarifications ?? [],
    safeExplanation: input.outcome,
    actionRequestId: input.actionRequestId,
    approvalRequestId: input.approvalRequestId,
    context: {}
  };

  if (input.intent === "unknown") {
    return {
      ...base,
      directive: "handoff_to_human",
      reasonCode: "UNKNOWN_INTENT",
      operatorInterventionRequired: true,
      canRetry: false,
      canReconcile: false
    };
  }

  if (input.lifecycleState === "reconciliation_required") {
    return {
      ...base,
      directive: "reconcile",
      reasonCode: "UNKNOWN_DOWNSTREAM_OUTCOME",
      operatorInterventionRequired: true,
      canRetry: false,
      canReconcile: true,
      context: {
        downstream_outcome: "unknown"
      }
    };
  }

  if (input.lifecycleState === "failed_retryable") {
    return {
      ...base,
      directive: "retry_later",
      reasonCode: "SAFE_RETRY_AVAILABLE",
      operatorInterventionRequired: true,
      canRetry: true,
      canReconcile: false
    };
  }

  if (input.lifecycleState === "human_review_required") {
    return {
      ...base,
      directive: "handoff_to_human",
      reasonCode: input.policyDecision === "clarification_needed" ? "CLARIFICATION_UNAVAILABLE" : "RECONCILIATION_UNRESOLVED",
      operatorInterventionRequired: true,
      canRetry: false,
      canReconcile: false
    };
  }

  if (input.lifecycleState === "failed_terminal") {
    return {
      ...base,
      directive: "handoff_to_human",
      reasonCode: "TERMINAL_FAILURE",
      operatorInterventionRequired: true,
      canRetry: false,
      canReconcile: false
    };
  }

  if (input.policyDecision === "clarification_needed") {
    return {
      ...base,
      directive: "clarify",
      reasonCode: "MISSING_REQUIRED_FIELDS",
      operatorInterventionRequired: false,
      canRetry: false,
      canReconcile: false
    };
  }

  if (input.policyDecision === "approval_required") {
    return {
      ...base,
      directive: "await_approval",
      reasonCode: "APPROVAL_REQUIRED",
      operatorInterventionRequired: true,
      canRetry: false,
      canReconcile: false
    };
  }

  if (input.policyDecision === "blocked") {
    const guardrailCodes = input.policy.guardrails.map((item) => item.code);
    return {
      ...base,
      directive: "handoff_to_human",
      reasonCode: guardrailCodes.includes("unknown_customer")
        ? "UNKNOWN_CUSTOMER"
        : guardrailCodes.includes("idempotency_key_conflict")
          ? "IDEMPOTENCY_CONFLICT"
          : "POLICY_BLOCKED",
      operatorInterventionRequired: true,
      canRetry: false,
      canReconcile: false
    };
  }

  return {
    ...base,
    directive: "continue",
    reasonCode: "COMPLETED",
    operatorInterventionRequired: false,
    canRetry: false,
    canReconcile: false
  };
}
