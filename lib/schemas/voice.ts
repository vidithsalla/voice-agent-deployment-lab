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
  "extraction_failed"
]);

export const policyEngineDecisionSchema = z.enum([
  "allow",
  "block",
  "clarify",
  "route_to_approval",
  "escalate"
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
