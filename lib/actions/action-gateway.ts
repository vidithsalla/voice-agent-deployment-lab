import crypto from "node:crypto";
import { createActionLog, createGuardrailEvents, createInteraction, createWebhookEvent } from "@/lib/actions/audit";
import { requestApproval } from "@/lib/actions/approvals";
import { getBudgetStatus } from "@/lib/actions/budget";
import { resolveCaller } from "@/lib/actions/caller";
import { createSiteIssue } from "@/lib/actions/escalations";
import { buildFollowupMessage, saveFollowup } from "@/lib/actions/followups";
import { buildNextStep } from "@/lib/actions/next-step";
import { getPurchaseOrderStatus } from "@/lib/actions/purchaseOrders";
import { createRequisition } from "@/lib/actions/requisitions";
import { checkStock } from "@/lib/actions/stock";
import { getVendorPaymentStatus } from "@/lib/actions/vendorPayments";
import { getRepository } from "@/lib/db/repository";
import { extractVoiceRequest, resolveExtractionMode } from "@/lib/extraction";
import { getMissingFields } from "@/lib/extraction/shared";
import type { BlandVariables, ExtractionMode } from "@/lib/extraction/types";
import { evaluatePolicy } from "@/lib/policies/engine";
import type { ActionEnvelope } from "@/lib/schemas/actions";
import type { PolicyResult } from "@/lib/policies/types";
import type { ExtractedFields } from "@/lib/simulator/extraction";
import type { AdapterFailureMode, ActionLifecycleState } from "@/lib/db/types";

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
  customerConfigKey?: string;
  /** Fail closed when no customer key is supplied instead of using the demo default tenant. */
  customerKeyRequired?: boolean;
  /**
   * Treat `idempotencyKey` as a per-call base and derive the logical action key from it plus the
   * normalized action payload, so one call can carry several distinct actions.
   */
  scopeIdempotencyToPayload?: boolean;
}

const DEFAULT_DEMO_CUSTOMER_KEY = "ventra";

function timelineStep(
  input: Omit<ActionEnvelope["timeline"][number], "timestamp">
): ActionEnvelope["timeline"][number] {
  return {
    ...input,
    timestamp: new Date().toISOString()
  };
}

function sortForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForFingerprint);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortForFingerprint(entry)])
    );
  }

  return value;
}

function buildActionFingerprint(intent: ActionEnvelope["intent"], fields: ExtractedFields) {
  return JSON.stringify(sortForFingerprint({ intent, fields }));
}

/**
 * Returns the tenant key to look up, or null when it cannot be resolved. A supplied key is never
 * replaced by a default; only a completely absent key may use the demo default (unless required).
 */
function resolveCustomerConfigKey(input: RunVoiceActionInput): string | null {
  const supplied = input.customerConfigKey ?? input.sourceMetadata?.customerKey ?? input.sourceMetadata?.customer_key;
  if (supplied === undefined || supplied === null) {
    return input.customerKeyRequired ? null : DEFAULT_DEMO_CUSTOMER_KEY;
  }
  return typeof supplied === "string" && supplied.trim() ? supplied.trim() : null;
}

function deriveScopedIdempotencyKey(baseKey: string, fingerprint: string) {
  return `${baseKey}:${crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`;
}

function gatedPolicy(input: {
  code: "unknown_customer" | "idempotency_key_conflict";
  check: "customer_resolved" | "idempotency_fingerprint_match";
  reason: string;
}): PolicyResult {
  return {
    allowed: false,
    decision: "blocked",
    engineDecision: "block",
    guardrails: [{ code: input.code, reason: input.reason }],
    reasons: [input.reason],
    checks: [{ name: input.check, passed: false, reason: input.reason }]
  };
}

function resolveFailureMode(input: RunVoiceActionInput): AdapterFailureMode {
  const value = input.sourceMetadata?.failureMode ?? input.sourceMetadata?.failure_mode;
  const supported: AdapterFailureMode[] = [
    "none",
    "timeout_before_mutation",
    "retryable_5xx",
    "mutated_response_lost",
    "terminal_validation_failure"
  ];
  return typeof value === "string" && supported.includes(value as AdapterFailureMode)
    ? (value as AdapterFailureMode)
    : "none";
}

function lifecycleForDecision(decision: ActionEnvelope["policyDecision"]): ActionLifecycleState {
  if (decision === "allowed") {
    return "validated";
  }
  if (decision === "approval_required") {
    return "approval_pending";
  }
  if (decision === "clarification_needed") {
    return "clarification_required";
  }
  return "blocked";
}

function actionTimelineStatus(
  policyDecision: ActionEnvelope["policyDecision"],
  lifecycleState: ActionLifecycleState
): ActionEnvelope["timeline"][number]["status"] {
  if (lifecycleState === "reconciliation_required") {
    return "reconciliation_required";
  }
  if (lifecycleState === "human_review_required") {
    return "human_review_required";
  }
  if (lifecycleState === "failed_retryable" || lifecycleState === "failed_terminal") {
    return lifecycleState;
  }
  if (policyDecision === "allowed" || policyDecision === "approval_required") {
    return "completed";
  }
  if (policyDecision === "clarification_needed") {
    return "clarification_needed";
  }
  return "blocked";
}

function readObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function removeUntrustedFields(
  intent: ActionEnvelope["intent"],
  fields: ExtractedFields,
  sourceMetadata?: Record<string, unknown>
) {
  const fieldProvenance = readObject(sourceMetadata?.fieldProvenance);
  const explicitlyUntrusted = new Set(stringArray(sourceMetadata?.untrustedFields));
  const sanitizedFields = { ...fields };
  const removedFields: string[] = [];

  for (const [field, source] of Object.entries(fieldProvenance ?? {})) {
    if (
      source === "untrusted_inference" ||
      source === "llm_inference" ||
      source === "upstream_authorization_hint"
    ) {
      explicitlyUntrusted.add(field);
    }
  }

  for (const field of explicitlyUntrusted) {
    if (field in sanitizedFields) {
      delete sanitizedFields[field as keyof ExtractedFields];
      removedFields.push(field);
    }
  }

  return {
    fields: sanitizedFields,
    missingFields: getMissingFields(intent, sanitizedFields),
    removedFields
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
  const candidateFields = { ...extraction.fields, ...input.overrideFields };
  const sanitized = removeUntrustedFields(intent, candidateFields, input.sourceMetadata);
  const fields = sanitized.fields;
  const missingFields =
    sanitized.removedFields.length > 0
      ? sanitized.missingFields
      : extraction.missingFields.filter((field) => !(input.overrideFields && field in input.overrideFields));

  timeline.push(
    timelineStep({
      step: "extraction_completed",
      status: extraction.extractionFailed ? "failed" : missingFields.length > 0 ? "clarification_needed" : "completed",
      inputSummary: extractionMode,
      outputSummary: `${intent} ${JSON.stringify(fields)}`,
      latencyMs: Date.now() - extractionStartedAt,
      guardrails: extraction.extractionFailed ? ["extraction_failed"] : [],
      reasons: [
        ...extraction.extractionWarnings,
        ...extraction.validationErrors,
        ...sanitized.removedFields.map((field) => `${field} removed because provenance was untrusted inference.`)
      ]
    })
  );

  const callerStartedAt = Date.now();
  const caller = await resolveCaller(input.callerPhone);
  const orgId = caller?.orgId ?? "org-ventra";
  const customerConfigKey = resolveCustomerConfigKey(input);
  const customerConfig = customerConfigKey ? await getRepository().getCustomerConfigByKey(customerConfigKey) : null;
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
  const baseIdempotencyKey = input.idempotencyKey ?? input.interactionId;
  const actionFingerprint = buildActionFingerprint(intent, fields);
  const idempotencyKey = input.scopeIdempotencyToPayload
    ? deriveScopedIdempotencyKey(baseIdempotencyKey, actionFingerprint)
    : baseIdempotencyKey;
  const priorActionRequest =
    intent !== "unknown" ? await getRepository().getActionRequestByIdempotency(idempotencyKey) : null;
  const idempotencyConflict = Boolean(priorActionRequest && priorActionRequest.fingerprint !== actionFingerprint);
  const gate = !customerConfig
    ? gatedPolicy({
        code: "unknown_customer",
        check: "customer_resolved",
        reason: "Customer configuration could not be resolved; no action was taken."
      })
    : idempotencyConflict
      ? gatedPolicy({
          code: "idempotency_key_conflict",
          check: "idempotency_fingerprint_match",
          reason: "Idempotency key was already used for a different request; no action was taken."
        })
      : null;
  const rawPolicy =
    gate ??
    (await evaluatePolicy({
      caller,
      intent,
      fields,
      customerConfig,
      idempotencyKey
    }));
  const policy =
    gate
      ? gate
      : extraction.extractionFailed && intent !== "escalate_site_issue"
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

  let outcome = "No action was taken.";
  let action: string = intent;
  let data: ActionEnvelope["data"] = {};
  const relatedRecords: ActionEnvelope["relatedRecords"] = {};
  let lifecycleState = lifecycleForDecision(policy.decision);
  const adapterFailureMode = resolveFailureMode(input);
  const canTrackAction = intent !== "unknown" && !gate;
  const actionRequestClaim = canTrackAction
    ? await getRepository().createActionRequest({
        orgId,
        customerConfigKey: customerConfig?.key ?? customerConfigKey ?? "",
        interactionId: input.interactionId,
        actionName: intent,
        idempotencyKey,
        fingerprint: actionFingerprint,
        lifecycleState,
        policyDecision: policy.decision
      })
    : null;
  const actionRequest = actionRequestClaim?.actionRequest ?? null;
  if (actionRequestClaim?.reused && actionRequest && actionRequest.fingerprint !== actionFingerprint) {
    // Only reachable when two different payloads race for the same key; never execute or replay.
    throw new Error("idempotency_key_conflict");
  }
  if (actionRequest) {
    relatedRecords.actionRequestId = actionRequest.id;
    data = {
      ...data,
      actionRequest: {
        id: actionRequest.id,
        lifecycleState: actionRequest.lifecycleState,
        idempotencyKey: actionRequest.idempotencyKey,
        fingerprint: actionRequest.fingerprint,
        reused: actionRequestClaim?.reused ?? false
      },
      customerConfig: customerConfig
        ? {
            key: customerConfig.key,
            name: customerConfig.name,
            policyVersion: customerConfig.policyVersion,
            materialApprovalLimit: customerConfig.materialApprovalLimit
          }
        : null
    };

    timeline.push(
      timelineStep({
        step: "action_request_claimed",
        status: actionRequestClaim?.reused ? "replayed" : "completed",
        inputSummary: idempotencyKey,
        outputSummary: `${actionRequest.lifecycleState} for ${actionRequest.actionName}`,
        latencyMs: 0,
        guardrails: [],
        reasons: actionRequestClaim?.reused ? ["Existing idempotency record reused."] : []
      })
    );
  }

  if (intent === "check_stock" && policy.decision === "allowed") {
    const stock = await checkStock(fields.siteName ?? "", fields.materialName ?? "");
    outcome = stock
      ? `${stock.availableQuantity} ${stock.material.unit}(s) of ${stock.material.name} available at ${stock.site.name}.`
      : "Stock lookup could not find a matching site or material.";
    data = stock ? { stock } : {};
  }

  if (intent === "check_po_status" && policy.decision === "allowed") {
    if (adapterFailureMode === "retryable_5xx" && actionRequest) {
      await getRepository().recordAdapterAttempt({
        orgId,
        actionRequestId: actionRequest.id,
        adapterName: "mock_erp_read",
        failureMode: adapterFailureMode,
        status: "failed_retryable",
        requestPayload: { intent, fields, idempotencyKey, attempt: 1 },
        responsePayload: { simulated: true, mutationConfirmed: false, statusCode: 503 }
      });
    }
    const po = await getPurchaseOrderStatus(fields.poCode ?? "");
    outcome = po
      ? `${po.code} is ${po.status} with ${po.vendorName}; expected ${po.expectedDeliveryDate}.`
      : "Purchase order not found.";
    data = po ? { ...data, purchaseOrder: po } : data;
    if (adapterFailureMode === "retryable_5xx" && actionRequest) {
      await getRepository().recordAdapterAttempt({
        orgId,
        actionRequestId: actionRequest.id,
        adapterName: "mock_erp_read",
        failureMode: "none",
        status: "succeeded",
        requestPayload: { intent, fields, idempotencyKey, attempt: 2 },
        responsePayload: { simulated: true, mutationConfirmed: false, retriedRead: true }
      });
      data = { ...data, readRetry: { attempts: 2, reason: "Read-only retry after transient 5xx." } };
    }
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
      if (
        actionRequestClaim?.reused &&
        actionRequest &&
        ["reconciliation_required", "failed_retryable", "human_review_required", "failed_terminal"].includes(
          actionRequest.lifecycleState
        )
      ) {
        lifecycleState = actionRequest.lifecycleState;
        outcome =
          typeof actionRequest.resultPayload?.outcome === "string"
            ? actionRequest.resultPayload.outcome
            : "Existing action request is not safe to execute automatically.";
        data = {
          ...data,
          idempotency: {
            reused: true,
            recovered: false,
            originalActionRequestId: actionRequest.id
          }
        };
      } else if (actionRequestClaim?.reused && actionRequest?.resultPayload?.requisitionId) {
        const requisitionId = String(actionRequest.resultPayload.requisitionId);
        relatedRecords.requisitionId = requisitionId;
        outcome = `Replayed idempotent requisition ${requisitionId} for ${fields.quantity} ${fields.materialName}.`;
        lifecycleState = actionRequest.lifecycleState === "failed_retryable" ? "recovered" : "succeeded";
        if (actionRequest.lifecycleState === "failed_retryable") {
          await getRepository().recordAdapterAttempt({
            orgId,
            actionRequestId: actionRequest.id,
            adapterName: "mock_erp",
            failureMode: "none",
            status: "recovered",
            requestPayload: { intent, fields, idempotencyKey },
            responsePayload: { requisitionId, recoveredFrom: actionRequest.errorCode ?? "unknown" }
          });
        }
        await getRepository().updateActionRequest(actionRequest.id, {
          lifecycleState,
          resultPayload: { requisitionId, outcome },
          errorCode: null
        });
        data = {
          ...data,
          idempotency: {
            reused: true,
            recovered: lifecycleState === "recovered",
            originalActionRequestId: actionRequest.id
          }
        };
      } else {
        if (actionRequest) {
          await getRepository().updateActionRequest(actionRequest.id, { lifecycleState: "executing" });
          lifecycleState = "executing";
        }

        if (adapterFailureMode === "timeout_before_mutation" || adapterFailureMode === "retryable_5xx") {
          outcome =
            adapterFailureMode === "timeout_before_mutation"
              ? "Mock ERP timed out before a mutation was confirmed; retry is safe."
              : "Mock ERP returned a retryable 5xx before a mutation was confirmed.";
          lifecycleState = "failed_retryable";
          if (actionRequest) {
            await getRepository().recordAdapterAttempt({
              orgId,
              actionRequestId: actionRequest.id,
              adapterName: "mock_erp",
              failureMode: adapterFailureMode,
              status: "failed_retryable",
              requestPayload: { intent, fields, idempotencyKey },
              responsePayload: { simulated: true, mutationConfirmed: false, outcome }
            });
            await getRepository().updateActionRequest(actionRequest.id, {
              lifecycleState,
              errorCode: adapterFailureMode,
              resultPayload: {
                outcome,
                fields,
                callerUserId: caller?.userId ?? "unknown",
                retrySafety: {
                  safeToRetry: true,
                  reason: "Downstream adapter reported failure before mutation."
                }
              }
            });
          }
        } else if (adapterFailureMode === "terminal_validation_failure") {
          outcome = "Mock ERP rejected the material request with a terminal validation failure.";
          lifecycleState = "failed_terminal";
          if (actionRequest) {
            await getRepository().recordAdapterAttempt({
              orgId,
              actionRequestId: actionRequest.id,
              adapterName: "mock_erp",
              failureMode: adapterFailureMode,
              status: "failed_terminal",
              requestPayload: { intent, fields, idempotencyKey },
              responsePayload: { simulated: true, mutationConfirmed: false, outcome }
            });
            await getRepository().updateActionRequest(actionRequest.id, {
              lifecycleState,
              errorCode: adapterFailureMode,
              resultPayload: { outcome }
            });
          }
        } else {
          const requisition = await createRequisition({
            interactionId: input.interactionId,
            callerUserId: caller?.userId ?? "unknown",
            siteName: fields.siteName ?? "",
            materialName: fields.materialName ?? "",
            quantity: fields.quantity ?? 0,
            neededBy: fields.neededBy ?? "",
            idempotencyKey
          });
          outcome = requisition
            ? `Created requisition ${requisition.id} for ${fields.quantity} ${fields.materialName}.`
            : "Requisition could not be created.";
          if (requisition) {
            if (adapterFailureMode !== "mutated_response_lost") {
              relatedRecords.requisitionId = requisition.id;
              data = { ...data, requisition };
            }
            lifecycleState = adapterFailureMode === "mutated_response_lost" ? "reconciliation_required" : "succeeded";
            if (actionRequest) {
              await getRepository().recordAdapterAttempt({
                orgId,
                actionRequestId: actionRequest.id,
                adapterName: "mock_erp",
                failureMode: adapterFailureMode,
                status: lifecycleState === "reconciliation_required" ? "reconciliation_required" : "succeeded",
                requestPayload: { intent, fields, idempotencyKey },
                responsePayload: {
                  simulated: adapterFailureMode !== "none",
                  mutationConfirmed: adapterFailureMode === "mutated_response_lost" ? "unknown_to_voicelab" : true,
                  correlationKey: idempotencyKey,
                  ...(adapterFailureMode === "mutated_response_lost" ? {} : { requisitionId: requisition.id }),
                  responseLost: adapterFailureMode === "mutated_response_lost"
                }
              });
              await getRepository().updateActionRequest(actionRequest.id, {
                lifecycleState,
                resultPayload:
                  adapterFailureMode === "mutated_response_lost"
                    ? {
                        outcome:
                          "Mock ERP mutation outcome is unknown to VoiceLab because the response was lost; reconciliation is required before retry.",
                        fields,
                        callerUserId: caller?.userId ?? "unknown",
                        reconciliation: {
                          status: "required",
                          simulated: true,
                          correlationKey: idempotencyKey
                        }
                      }
                    : { requisitionId: requisition.id, outcome },
                errorCode: adapterFailureMode === "mutated_response_lost" ? adapterFailureMode : null
              });
            }
            if (adapterFailureMode === "mutated_response_lost") {
              outcome =
                "Mock ERP response was lost after a mutating request; VoiceLab requires reconciliation before any retry.";
            }
            await recordSubActionLog({
              orgId,
              interactionId: input.interactionId,
              actionName: "requisition_record_created",
              payload: {
                requisitionId: requisition.id,
                totalCost: requisition.totalCost,
                lifecycleState,
                failureMode: adapterFailureMode
              }
            });
          } else {
            lifecycleState = "failed_terminal";
            if (actionRequest) {
              await getRepository().updateActionRequest(actionRequest.id, {
                lifecycleState,
                errorCode: "requisition_not_created",
                resultPayload: { outcome }
              });
            }
          }
        }
      }
    }

    if (policy.decision === "approval_required") {
      const approval = await requestApproval({
        interactionId: input.interactionId,
        callerUserId: caller?.userId ?? "unknown",
        siteName: fields.siteName ?? "",
        reason: policy.guardrails[0]?.reason ?? "Budget exceeded",
        idempotencyKey
      });
      outcome = approval
        ? `Routed material request to approval ${approval.id}.`
        : "Approval request could not be created.";
      if (approval) {
        relatedRecords.approvalRequestId = approval.id;
        lifecycleState = "approval_pending";
        data = { ...data, approval };
        if (actionRequest) {
          await getRepository().updateActionRequest(actionRequest.id, {
            lifecycleState,
            approvalRequestId: approval.id,
            resultPayload: {
              approvalRequestId: approval.id,
              outcome,
              fields,
              callerUserId: caller?.userId ?? "unknown",
              requestedAt: new Date().toISOString()
            }
          });
        }
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
    if (actionRequest) {
      await getRepository().updateActionRequest(actionRequest.id, { lifecycleState: "executing" });
      lifecycleState = "executing";
    }
    const issue = await createSiteIssue({
      interactionId: input.interactionId,
      callerUserId: caller?.userId ?? "unknown",
      siteName: fields.siteName ?? "",
      issueSummary: fields.issueSummary ?? input.transcript,
      idempotencyKey
    });
    outcome = issue ? `Created urgent site issue ${issue.id}.` : "Site issue could not be created.";
    if (issue) {
      relatedRecords.siteIssueId = issue.id;
      lifecycleState = "succeeded";
      data = { ...data, siteIssue: issue };
      if (actionRequest) {
        await getRepository().recordAdapterAttempt({
          orgId,
          actionRequestId: actionRequest.id,
          adapterName: "mock_erp",
          failureMode: "none",
          status: "succeeded",
          requestPayload: { intent, fields, idempotencyKey },
          responsePayload: { siteIssueId: issue.id }
        });
        await getRepository().updateActionRequest(actionRequest.id, {
          lifecycleState,
          resultPayload: { siteIssueId: issue.id, outcome },
          errorCode: null
        });
      }
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
    lifecycleState = input.sourceMetadata?.clarificationUnavailable === true ? "human_review_required" : "clarification_required";
    if (lifecycleState === "human_review_required") {
      outcome = "The request is missing required details and clarification is unavailable; human review is required.";
    }
  }

  if (policy.decision === "blocked") {
    outcome = policy.guardrails[0]?.reason ?? "Request blocked by policy.";
    lifecycleState = "blocked";
  }

  if (intent === "unknown") {
    action = "extract_intent";
    outcome = extraction.extractionFailed ? "Extraction failed and intent could not be classified." : "Intent could not be classified.";
  }

  if (
    actionRequest &&
    policy.decision !== "allowed" &&
    policy.decision !== "approval_required"
  ) {
    await getRepository().updateActionRequest(actionRequest.id, {
      lifecycleState,
      resultPayload: { outcome, guardrails: policy.guardrails },
      errorCode: policy.guardrails[0]?.code ?? null
    });
  }

  if (
    actionRequest &&
    policy.decision === "allowed" &&
    intent !== "create_material_request" &&
    intent !== "escalate_site_issue"
  ) {
    lifecycleState = "succeeded";
    await getRepository().updateActionRequest(actionRequest.id, {
      lifecycleState,
      resultPayload: { outcome, relatedRecords },
      errorCode: null
    });
  }

  timeline.push(
    timelineStep({
      step: "action_attempted",
      status: actionTimelineStatus(policy.decision, lifecycleState),
      inputSummary: action,
      outputSummary: outcome,
      latencyMs: 0,
      guardrails: policy.guardrails.map((item) => item.code),
      reasons: [...policy.reasons, `lifecycle=${lifecycleState}`]
    })
  );

  const followupMessage = buildFollowupMessage({
    callerName: caller?.name ?? null,
    policyDecision: policy.decision,
    outcome
  });

  const nextStep = buildNextStep({
    policyDecision: policy.decision,
    policy,
    lifecycleState,
    outcome,
    actionRequestId: actionRequest?.id,
    approvalRequestId: relatedRecords.approvalRequestId,
    intent
  });

  const response: ActionEnvelope = {
    ok:
      intent !== "unknown" &&
      policy.decision !== "blocked" &&
      lifecycleState !== "reconciliation_required" &&
      lifecycleState !== "human_review_required" &&
      lifecycleState !== "failed_retryable" &&
      lifecycleState !== "failed_terminal",
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
    nextStep,
    timeline,
    data: {
      ...data,
      actionRequest: actionRequest
        ? {
            id: actionRequest.id,
            lifecycleState,
            idempotencyKey,
            fingerprint: actionFingerprint,
            reused: actionRequestClaim?.reused ?? false,
            nextStepDirective: nextStep.directive
          }
        : undefined,
      fieldProvenance: {
        extractionSource: extraction.rawExtractionSource,
        removedUntrustedFields: sanitized.removedFields,
        policyInputs: Object.keys(fields)
      },
      followupMessage
    },
    errors:
      lifecycleState === "failed_retryable" ||
      lifecycleState === "reconciliation_required" ||
      lifecycleState === "human_review_required" ||
      lifecycleState === "failed_terminal"
        ? [{ code: adapterFailureMode, message: outcome }]
        : []
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
      nextStep: response.nextStep,
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
