import { z } from "zod";
import { blandVariablesSchema, extractionModeSchema, extractionSourceSchema } from "@/lib/extraction/types";
import {
  extractedFieldsSchema,
  guardrailCodeSchema,
  intentSchema,
  interactionContextSchema,
  policyEngineDecisionSchema,
  policyDecisionSchema
} from "@/lib/schemas/voice";

const timelineStepSchema = z.object({
  step: z.string(),
  timestamp: z.string(),
  status: z.enum(["completed", "blocked", "clarification_needed", "failed", "skipped"]),
  inputSummary: z.string(),
  outputSummary: z.string(),
  latencyMs: z.number(),
  guardrails: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([])
});

export const actionEnvelopeSchema = z.object({
  ok: z.boolean(),
  interactionId: z.string(),
  caller: z
    .object({
      userId: z.string().nullable(),
      name: z.string().nullable(),
      orgId: z.string().nullable(),
      siteIds: z.array(z.string()),
      role: z.string().nullable(),
      known: z.boolean()
    })
    .nullable(),
  intent: intentSchema,
  extractedFields: extractedFieldsSchema,
  extraction: z.object({
    mode: extractionModeSchema,
    source: extractionSourceSchema,
    confidence: z.number().nullable().optional(),
    missingFields: z.array(z.string()),
    normalizedTranscript: z.string(),
    warnings: z.array(z.string()),
    validationErrors: z.array(z.string()),
    failed: z.boolean()
  }),
  policyDecision: policyDecisionSchema,
  policy: z.object({
    allowed: z.boolean(),
    engineDecision: policyEngineDecisionSchema,
    reasons: z.array(z.string()),
    requiredClarifications: z.array(z.string()).optional(),
    checks: z.array(
      z.object({
        name: z.string(),
        passed: z.boolean(),
        reason: z.string()
      })
    )
  }),
  action: z.string(),
  outcome: z.string(),
  guardrails: z.array(
    z.object({
      code: guardrailCodeSchema,
      reason: z.string()
    })
  ),
  relatedRecords: z.object({
    requisitionId: z.string().optional(),
    approvalRequestId: z.string().optional(),
    siteIssueId: z.string().optional(),
    purchaseOrderId: z.string().optional()
  }),
  timeline: z.array(timelineStepSchema),
  data: z.record(z.string(), z.unknown()).default({}),
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string()
    })
  )
});

export const callerResolutionRequestSchema = z.object({
  callerPhone: z.string()
});

export const extractIntentRequestSchema = z.object({
  transcript: z.string(),
  extractionMode: extractionModeSchema.optional(),
  variables: blandVariablesSchema.optional()
});

export const checkStockRequestSchema = z.object({
  callerPhone: z.string(),
  transcript: z.string(),
  siteName: z.string().optional(),
  materialName: z.string().optional()
});

export const checkBudgetRequestSchema = z.object({
  callerPhone: z.string(),
  transcript: z.string(),
  siteName: z.string(),
  materialName: z.string(),
  quantity: z.number()
});

export const createRequisitionRequestSchema = interactionContextSchema.extend({
  idempotencyKey: z.string(),
  siteName: z.string(),
  materialName: z.string(),
  quantity: z.number(),
  neededBy: z.string(),
  bypassApproval: z.boolean().optional()
});

export const requestApprovalRequestSchema = interactionContextSchema.extend({
  idempotencyKey: z.string(),
  siteName: z.string(),
  reason: z.string()
});

export const checkPoStatusRequestSchema = interactionContextSchema.extend({
  poCode: z.string()
});

export const checkVendorPaymentRequestSchema = interactionContextSchema.extend({
  vendorName: z.string()
});

export const escalateSiteIssueRequestSchema = interactionContextSchema.extend({
  idempotencyKey: z.string(),
  siteName: z.string(),
  issueSummary: z.string()
});

export const sendFollowupRequestSchema = interactionContextSchema.extend({
  message: z.string()
});

export const runScenarioRequestSchema = z.object({
  scenarioId: z.string().optional(),
  transcript: z.string(),
  callerPhone: z.string(),
  idempotencyKey: z.string(),
  extractionMode: extractionModeSchema.optional(),
  variables: blandVariablesSchema.optional()
});

export const blandWebhookRequestSchema = z.object({
  call_id: z.string(),
  caller_phone: z.string(),
  transcript: z.string(),
  variables: blandVariablesSchema.optional(),
  metadata: z
    .object({
      pathway_id: z.string().optional(),
      node_id: z.string().optional()
    })
    .optional()
});

export type ActionEnvelope = z.infer<typeof actionEnvelopeSchema>;
