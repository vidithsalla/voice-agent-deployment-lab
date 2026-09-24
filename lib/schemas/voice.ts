import { z } from "zod";

export const intentSchema = z.enum([
  "create_material_request",
  "check_stock",
  "check_po_status",
  "check_vendor_payment",
  "escalate_site_issue",
  "unknown"
]);

export const policyDecisionSchema = z.enum([
  "allowed",
  "blocked",
  "clarification_needed",
  "approval_required"
]);

export const guardrailCodeSchema = z.enum([
  "unknown_caller",
  "site_access_denied",
  "missing_required_fields",
  "budget_exceeded",
  "restricted_finance_access",
  "duplicate_request",
  "approval_bypass_attempt",
  "emergency_escalation",
  "extraction_failed",
  "unknown_customer",
  "idempotency_key_conflict"
]);

export const policyEngineDecisionSchema = z.enum([
  "allow",
  "block",
  "clarify",
  "route_to_approval",
  "escalate"
]);

export const actionLifecycleStateSchema = z.enum([
  "received",
  "validated",
  "clarification_required",
  "human_review_required",
  "blocked",
  "approval_pending",
  "approved",
  "rejected",
  "executing",
  "succeeded",
  "reconciliation_required",
  "failed_retryable",
  "failed_terminal",
  "recovered"
]);

export const nextStepDirectiveSchema = z.enum([
  "continue",
  "clarify",
  "await_approval",
  "handoff_to_human",
  "retry_later",
  "reconcile"
]);

export const nextStepReasonCodeSchema = z.enum([
  "COMPLETED",
  "MISSING_REQUIRED_FIELDS",
  "CLARIFICATION_UNAVAILABLE",
  "APPROVAL_REQUIRED",
  "POLICY_BLOCKED",
  "UNKNOWN_INTENT",
  "UNKNOWN_DOWNSTREAM_OUTCOME",
  "SAFE_RETRY_AVAILABLE",
  "UNKNOWN_CUSTOMER",
  "IDEMPOTENCY_CONFLICT",
  "RECONCILIATION_UNRESOLVED",
  "TERMINAL_FAILURE"
]);

export const extractedFieldsSchema = z.object({
  siteName: z.string().optional(),
  materialName: z.string().optional(),
  quantity: z.number().optional(),
  neededBy: z.string().optional(),
  urgency: z.string().optional(),
  poCode: z.string().optional(),
  vendorName: z.string().optional(),
  issueSummary: z.string().optional(),
  bypassAttempt: z.boolean().optional()
});

export const interactionContextSchema = z.object({
  interactionId: z.string(),
  callerPhone: z.string(),
  transcript: z.string(),
  idempotencyKey: z.string().optional()
});
