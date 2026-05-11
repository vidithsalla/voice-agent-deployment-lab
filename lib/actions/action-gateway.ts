import { createActionLog, createGuardrailEvents, createInteraction, createWebhookEvent } from "@/lib/actions/audit";
import { requestApproval } from "@/lib/actions/approvals";
import { getBudgetStatus } from "@/lib/actions/budget";
import { resolveCaller } from "@/lib/actions/caller";
import { createSiteIssue } from "@/lib/actions/escalations";
import { buildFollowupMessage, saveFollowup } from "@/lib/actions/followups";
import { getPurchaseOrderStatus } from "@/lib/actions/purchaseOrders";
import { createRequisition } from "@/lib/actions/requisitions";
import { checkStock } from "@/lib/actions/stock";
import { getVendorPaymentStatus } from "@/lib/actions/vendorPayments";
import { extractVoiceRequest, resolveExtractionMode } from "@/lib/extraction";
import type { BlandVariables, ExtractionMode } from "@/lib/extraction/types";
import { evaluatePolicy } from "@/lib/policies/engine";
import type { ActionEnvelope } from "@/lib/schemas/actions";
import type { ExtractedFields } from "@/lib/simulator/extraction";

interface RunVoiceActionInput {
  interactionId: string;
  callerPhone: string;
  transcript: string;
  idempotencyKey?: string;
  overrideFields?: ExtractedFields;
  overrideIntent?: ActionEnvelope["intent"];
  extractionMode?: ExtractionMode;
  blandVariables?: BlandVariables;
  sourceMetadata?: Record<string, unknown>;
}

function timelineStep(
  input: Omit<ActionEnvelope["timeline"][number], "timestamp">
): ActionEnvelope["timeline"][number] {
  return {
    ...input,
    timestamp: new Date().toISOString()
  };
}

async function recordSubActionLog(input: {
  orgId: string;
  interactionId: string;
  actionName: string;
  payload: Record<string, unknown>;
}) {
  await createActionLog({
    orgId: input.orgId,
    interactionId: input.interactionId,
    actionName: input.actionName,
    requestPayload: input.payload,
    responsePayload: input.payload
  });

  await createWebhookEvent({
    orgId: input.orgId,
    interactionId: input.interactionId,
    actionName: input.actionName,
    requestBody: input.payload,
    responseBody: input.payload
  });
}

export async function runVoiceAction(input: RunVoiceActionInput): Promise<ActionEnvelope> {
  const timeline: ActionEnvelope["timeline"] = [];

  const transcriptStartedAt = Date.now();
  timeline.push(
    timelineStep({
      step: "transcript_received",
      status: "completed",
      inputSummary: input.callerPhone,
      outputSummary: input.transcript.slice(0, 160),
      latencyMs: Date.now() - transcriptStartedAt,
      guardrails: [],
      reasons: []
    })
  );

  const extractionMode = resolveExtractionMode(input.extractionMode);
  const extractionStartedAt = Date.now();
  const extraction = await extractVoiceRequest({
    transcript: input.transcript,
    mode: extractionMode,
    blandVariables: input.blandVariables
  });
  const intent = input.overrideIntent ?? extraction.intent;
  const fields = { ...extraction.fields, ...input.overrideFields };
  const missingFields = extraction.missingFields.filter((field) => !(input.overrideFields && field in input.overrideFields));

  timeline.push(
    timelineStep({
      step: "extraction_completed",
      status: extraction.extractionFailed ? "failed" : missingFields.length > 0 ? "clarification_needed" : "completed",
      inputSummary: extractionMode,
      outputSummary: `${intent} ${JSON.stringify(fields)}`,
      latencyMs: Date.now() - extractionStartedAt,
      guardrails: extraction.extractionFailed ? ["extraction_failed"] : [],
      reasons: [...extraction.extractionWarnings, ...extraction.validationErrors]
    })
  );

  const callerStartedAt = Date.now();
  const caller = await resolveCaller(input.callerPhone);
  timeline.push(
    timelineStep({
      step: "caller_resolved",
      status: caller ? "completed" : "blocked",
      inputSummary: input.callerPhone,
      outputSummary: caller ? `${caller.name} (${caller.role})` : "unknown caller",
      latencyMs: Date.now() - callerStartedAt,
      guardrails: caller ? [] : ["unknown_caller"],
      reasons: caller ? [] : ["Caller phone did not resolve to a seeded identity."]
    })
  );

  const policyStartedAt = Date.now();
  const rawPolicy = await evaluatePolicy({ caller, intent, fields });
  const policy =
    extraction.extractionFailed && intent !== "escalate_site_issue"
      ? {
          ...rawPolicy,
          allowed: false,
          decision: "clarification_needed" as const,
          engineDecision: "clarify" as const,
          guardrails: [...rawPolicy.guardrails, { code: "extraction_failed" as const, reason: "Extraction failed validation." }],
          reasons: [...rawPolicy.reasons, "Extraction output failed validation; action held safely."],
          requiredClarifications: missingFields.length > 0 ? missingFields : ["transcript"]
        }
      : missingFields.length > 0 && intent !== "unknown"
        ? {
            ...rawPolicy,
            requiredClarifications: Array.from(
              new Set([...(rawPolicy.requiredClarifications ?? []), ...missingFields])
            )
          }
        : rawPolicy;

  timeline.push(
    timelineStep({
      step: "policy_evaluated",
      status:
        policy.decision === "allowed"
          ? "completed"
          : policy.decision === "clarification_needed"
            ? "clarification_needed"
            : "blocked",
      inputSummary: `${intent} for ${caller?.name ?? "unknown caller"}`,
      outputSummary: `${policy.engineDecision} / ${policy.decision}`,
      latencyMs: Date.now() - policyStartedAt,
      guardrails: policy.guardrails.map((item) => item.code),
      reasons: policy.reasons
    })
  );

  const orgId = caller?.orgId ?? "org-ventra";
  let outcome = "No action was taken.";
  let action: string = intent;
  let data: ActionEnvelope["data"] = {};
  const relatedRecords: ActionEnvelope["relatedRecords"] = {};

  if (intent === "check_stock" && policy.decision === "allowed") {
    const stock = await checkStock(fields.siteName ?? "", fields.materialName ?? "");
    outcome = stock
      ? `${stock.availableQuantity} ${stock.material.unit}(s) of ${stock.material.name} available at ${stock.site.name}.`
      : "Stock lookup could not find a matching site or material.";
    data = stock ? { stock } : {};
  }

  if (intent === "check_po_status" && policy.decision === "allowed") {
    const po = await getPurchaseOrderStatus(fields.poCode ?? "");
    outcome = po
      ? `${po.code} is ${po.status} with ${po.vendorName}; expected ${po.expectedDeliveryDate}.`
      : "Purchase order not found.";
    data = po ? { purchaseOrder: po } : {};
    if (po) {
      relatedRecords.purchaseOrderId = po.id;
    }
  }

  if (intent === "check_vendor_payment" && policy.decision === "allowed") {
    const vendor = await getVendorPaymentStatus(fields.vendorName ?? "");
    outcome = vendor
      ? `${vendor.vendor.name} invoices are ${vendor.invoices.map((item) => item.paymentStatus).join(", ")}.`
      : "Vendor was not found.";
    data = vendor ? { vendorPayment: vendor } : {};
  }

  if (intent === "create_material_request") {
    const budget = await getBudgetStatus({
      siteName: fields.siteName ?? "",
      materialName: fields.materialName ?? "",
      quantity: fields.quantity ?? 0
    });
    data = { ...data, budgetStatus: budget };

    if (policy.decision === "allowed") {
      const requisition = await createRequisition({
        interactionId: input.interactionId,
        callerUserId: caller?.userId ?? "unknown",
        siteName: fields.siteName ?? "",
        materialName: fields.materialName ?? "",
        quantity: fields.quantity ?? 0,
        neededBy: fields.neededBy ?? "",
        idempotencyKey: input.idempotencyKey ?? input.interactionId
      });
      outcome = requisition
        ? `Created requisition ${requisition.id} for ${fields.quantity} ${fields.materialName}.`
        : "Requisition could not be created.";
      if (requisition) {
        relatedRecords.requisitionId = requisition.id;
        data = { ...data, requisition };
        await recordSubActionLog({
          orgId,
          interactionId: input.interactionId,
          actionName: "requisition_record_created",
          payload: { requisitionId: requisition.id, totalCost: requisition.totalCost }
        });
      }
    }

    if (policy.decision === "approval_required") {
      const approval = await requestApproval({
        interactionId: input.interactionId,
        callerUserId: caller?.userId ?? "unknown",
        siteName: fields.siteName ?? "",
        reason: policy.guardrails[0]?.reason ?? "Budget exceeded",
        idempotencyKey: input.idempotencyKey ?? input.interactionId
      });
      outcome = approval
        ? `Routed material request to approval ${approval.id}.`
        : "Approval request could not be created.";
      if (approval) {
        relatedRecords.approvalRequestId = approval.id;
        data = { ...data, approval };
        await recordSubActionLog({
          orgId,
          interactionId: input.interactionId,
          actionName: "approval_request_created",
          payload: { approvalRequestId: approval.id, reason: approval.reason }
        });
      }
    }
  }

  if (intent === "escalate_site_issue" && policy.decision === "allowed") {
    const issue = await createSiteIssue({
      interactionId: input.interactionId,
      callerUserId: caller?.userId ?? "unknown",
      siteName: fields.siteName ?? "",
      issueSummary: fields.issueSummary ?? input.transcript,
      idempotencyKey: input.idempotencyKey ?? input.interactionId
    });
    outcome = issue ? `Created urgent site issue ${issue.id}.` : "Site issue could not be created.";
    if (issue) {
      relatedRecords.siteIssueId = issue.id;
      data = { ...data, siteIssue: issue };
      await recordSubActionLog({
        orgId,
        interactionId: input.interactionId,
        actionName: "site_issue_created",
        payload: { siteIssueId: issue.id, severity: issue.severity }
      });
    }
  }

  if (policy.decision === "clarification_needed" && intent !== "unknown") {
    outcome = "The request is missing required details and needs clarification.";
  }

  if (policy.decision === "blocked") {
    outcome = policy.guardrails[0]?.reason ?? "Request blocked by policy.";
  }

  if (intent === "unknown") {
    action = "extract_intent";
    outcome = extraction.extractionFailed ? "Extraction failed and intent could not be classified." : "Intent could not be classified.";
  }

  timeline.push(
    timelineStep({
      step: "action_attempted",
      status:
        policy.decision === "allowed"
          ? "completed"
          : policy.decision === "approval_required"
            ? "completed"
            : policy.decision === "clarification_needed"
              ? "clarification_needed"
              : "blocked",
      inputSummary: action,
      outputSummary: outcome,
      latencyMs: 0,
      guardrails: policy.guardrails.map((item) => item.code),
      reasons: policy.reasons
    })
  );

  const followupMessage = buildFollowupMessage({
    callerName: caller?.name ?? null,
    policyDecision: policy.decision,
    outcome
  });

  const response: ActionEnvelope = {
    ok: intent !== "unknown" && policy.decision !== "blocked",
    interactionId: input.interactionId,
    caller: caller
      ? {
          userId: caller.userId,
          name: caller.name,
          orgId: caller.orgId,
          siteIds: caller.siteIds,
          role: caller.role,
          known: caller.known
        }
      : {
          userId: null,
          name: null,
          orgId: null,
          siteIds: [],
          role: null,
          known: false
        },
    intent,
    extractedFields: fields,
    extraction: {
      mode: extractionMode,
      source: extraction.rawExtractionSource,
      confidence: extraction.confidence ?? null,
      missingFields,
      normalizedTranscript: extraction.normalizedTranscript,
      warnings: extraction.extractionWarnings,
      validationErrors: extraction.validationErrors,
      failed: extraction.extractionFailed
    },
    policyDecision: policy.decision,
    policy: {
      allowed: policy.allowed,
      engineDecision: policy.engineDecision,
      reasons: policy.reasons,
      requiredClarifications: policy.requiredClarifications,
      checks: policy.checks
    },
    action,
    outcome,
    guardrails: policy.guardrails,
    relatedRecords,
    timeline,
    data: { ...data, followupMessage },
    errors: []
  };

  await createInteraction({
    interactionId: input.interactionId,
    orgId,
    siteId: fields.siteName === "Site A" ? "site-a" : fields.siteName === "Site B" ? "site-b" : null,
    callerPhone: input.callerPhone,
    callerId: caller?.userId ?? null,
    transcript: input.transcript,
    intent,
    extractedFields: fields,
    actionAttempted: action,
    policyDecision: policy.decision,
    outcome
  });

  await createActionLog({
    orgId,
    interactionId: input.interactionId,
    actionName: action,
    requestPayload: {
      ...input,
      extractionMode,
      blandVariables: input.blandVariables,
      sourceMetadata: input.sourceMetadata
    } as unknown as Record<string, unknown>,
    responsePayload: {
      extraction: response.extraction,
      policyDecision: response.policyDecision,
      guardrails: response.guardrails,
      relatedRecords: response.relatedRecords,
      timeline: response.timeline,
      outcome: response.outcome
    }
  });

  await createWebhookEvent({
    orgId,
    interactionId: input.interactionId,
    actionName: action,
    requestBody: {
      ...input,
      extractionMode,
      blandVariables: input.blandVariables,
      sourceMetadata: input.sourceMetadata
    } as unknown as Record<string, unknown>,
    responseBody: response
  });

  timeline.push(
    timelineStep({
      step: "audit_log_written",
      status: "completed",
      inputSummary: action,
      outputSummary: "interaction, action log, and webhook event stored",
      latencyMs: 0,
      guardrails: [],
      reasons: []
    })
  );

  if (policy.guardrails.length > 0) {
    await createGuardrailEvents({
      orgId,
      interactionId: input.interactionId,
      guardrails: policy.guardrails
    });
  }

  await saveFollowup({
    orgId,
    interactionId: input.interactionId,
    message: followupMessage
  });

  await recordSubActionLog({
    orgId,
    interactionId: input.interactionId,
    actionName: "followup_record_created",
    payload: { message: followupMessage }
  });

  timeline.push(
    timelineStep({
      step: "followup_generated",
      status: "completed",
      inputSummary: policy.decision,
      outputSummary: followupMessage,
      latencyMs: 0,
      guardrails: [],
      reasons: []
    })
  );

  return response;
}
