import type { ActionEnvelope } from "@/lib/schemas/actions";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { ActionRequestControls } from "@/components/action-request-controls";
import { buildNextStep } from "@/lib/actions/next-step";
import { getRepository } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function readObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "none";
  }

  return String(value);
}

function renderKeyValueRows(entries: Array<{ label: string; value: string }>) {
  return (
    <div className="detail-list">
      {entries.map((entry) => (
        <div key={entry.label} className="detail-row">
          <div className="subtle">{entry.label}</div>
          <div>{entry.value}</div>
        </div>
      ))}
    </div>
  );
}

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getRepository();
  const interaction = await repo.getInteractionById(id);

  if (!interaction) {
    notFound();
  }

  const [actions, webhooks, guardrails, followup, caller, actionRequests] = await Promise.all([
    repo.listActionLogsByInteraction(id),
    repo.listWebhookEventsByInteraction(id),
    repo.listGuardrailsByInteraction(id),
    repo.getFollowupByInteraction(id),
    repo.resolveCallerByPhone(interaction.callerPhone),
    repo.listActionRequests()
  ]);

  const topLevelWebhook = [...webhooks].reverse().find((item) => item.actionName === interaction.actionAttempted);
  const responseBody = readObject(topLevelWebhook?.responseBody) as ActionEnvelope | null;
  const policySnapshot = responseBody?.policy ?? null;
  const extractionSnapshot = responseBody?.extraction ?? null;
  const extractedFields = responseBody?.extractedFields ?? interaction.extractedFields;
  const timeline = responseBody?.timeline ?? [];
  const extractionObject = readObject(extractionSnapshot);
  const policyObject = readObject(policySnapshot);
  const extractedFieldObject = readObject(extractedFields);
  const actionRequest =
    actionRequests.find((item) => item.interactionId === id) ??
    actionRequests.find((item) => item.id === responseBody?.relatedRecords.actionRequestId) ??
    null;
  const currentOutcome =
    typeof actionRequest?.resultPayload?.outcome === "string" ? actionRequest.resultPayload.outcome : interaction.outcome;
  const nextStep =
    actionRequest && responseBody
      ? buildNextStep({
          policyDecision: actionRequest.policyDecision,
          policy: {
            guardrails: responseBody.guardrails,
            reasons: responseBody.policy.reasons,
            requiredClarifications: responseBody.policy.requiredClarifications
          },
          lifecycleState: actionRequest.lifecycleState,
          outcome: currentOutcome,
          actionRequestId: actionRequest.id,
          approvalRequestId: actionRequest.approvalRequestId ?? responseBody.relatedRecords.approvalRequestId
        })
      : responseBody?.nextStep ?? null;
  const returnedNextStep = responseBody?.nextStep ?? null;
  const adapterAttempts = actionRequest ? await repo.listAdapterAttemptsByActionRequest(actionRequest.id) : [];

  const guardrailCodes = guardrails.map((item) => item.code);
  const createdRecordId =
    (typeof actionRequest?.resultPayload?.requisitionId === "string" ? actionRequest.resultPayload.requisitionId : undefined) ??
    responseBody?.relatedRecords.requisitionId ??
    responseBody?.relatedRecords.approvalRequestId ??
    responseBody?.relatedRecords.siteIssueId ??
    responseBody?.relatedRecords.purchaseOrderId ??
    "none";

  const summaryRows = [
    { label: "Outcome", value: currentOutcome },
    { label: "Intent", value: interaction.intent },
    { label: "Caller", value: caller ? `${caller.name}, ${caller.role}` : interaction.callerPhone },
    { label: "Site", value: displayValue(extractedFieldObject?.siteName) },
    { label: "Org", value: caller?.orgId ?? "none" },
    { label: "Policy", value: interaction.policyDecision },
    { label: "Guardrails", value: guardrailCodes.length > 0 ? guardrailCodes.join(", ") : "none" },
    { label: "Record", value: createdRecordId },
    {
      label: "Extraction",
      value: `${displayValue(extractionObject?.mode)} / ${displayValue(extractionObject?.source)}`
    },
    {
      label: "Lifecycle",
      value: actionRequest?.lifecycleState ?? "none"
    },
    {
      label: "Next step",
      value: nextStep?.directive ?? "none"
    },
    {
      label: "Returned to Bland",
      value: returnedNextStep?.directive ?? "none"
    },
    {
      label: "Idempotency",
      value: actionRequest?.idempotencyKey ?? "none"
    }
  ];

  const extractedFieldRows = [
    { label: "Site", value: extractedFieldObject?.siteName },
    { label: "Material", value: extractedFieldObject?.materialName },
    { label: "Quantity", value: extractedFieldObject?.quantity },
    { label: "Needed by", value: extractedFieldObject?.neededBy },
    { label: "PO number", value: extractedFieldObject?.poCode },
    { label: "Vendor", value: extractedFieldObject?.vendorName },
    { label: "Issue", value: extractedFieldObject?.issueSummary },
    { label: "Urgency", value: extractedFieldObject?.urgency }
  ]
    .filter((item) => item.value !== undefined && item.value !== null && item.value !== "")
    .map((item) => ({ label: item.label, value: displayValue(item.value) }));

  const policyChecks = Array.isArray(policyObject?.checks) ? policyObject.checks : [];

  return (
    <main className="grid" style={{ gap: 20 }}>
      <section className="panel page-header">
        <div className="page-header-row">
          <div>
            <div className="eyebrow">Call Detail</div>
            <h1 className="page-title">{interaction.intent.replaceAll("_", " ")}</h1>
          </div>
          <div className="cta-row">
            {actionRequest ? <StatusBadge value={actionRequest.lifecycleState} /> : null}
            <StatusBadge value={interaction.policyDecision} />
          </div>
        </div>
        <p className="body-copy">{interaction.transcript}</p>
      </section>

      <section className="metric-grid">
        <div className="metric">
          <div className="eyebrow">Caller</div>
          <div className="metric-value" style={{ fontSize: "1.05rem" }}>
            {caller ? caller.name : interaction.callerPhone}
          </div>
          <div className="subtle" style={{ marginTop: 6 }}>{caller?.role ?? "unknown"}</div>
        </div>
        <div className="metric">
          <div className="eyebrow">Customer</div>
          <div className="metric-value" style={{ fontSize: "1.05rem" }}>
            {actionRequest?.customerConfigKey ?? caller?.orgId ?? "none"}
          </div>
          <div className="subtle" style={{ marginTop: 6 }}>{displayValue(extractedFieldObject?.siteName)}</div>
        </div>
        <div className="metric">
          <div className="eyebrow">Business record</div>
          <div className="metric-value mono" style={{ fontSize: "0.95rem" }}>{createdRecordId}</div>
        </div>
        <div className="metric">
          <div className="eyebrow">Adapter attempts</div>
          <div className="metric-value">{adapterAttempts.length}</div>
          <div className="subtle" style={{ marginTop: 6 }}>
            {adapterAttempts.at(-1)?.status ?? "no downstream write"}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar-row">
          <div>
            <div className="eyebrow">Run Summary</div>
            <h2 className="section-title">What happened</h2>
          </div>
          {actionRequest ? <StatusBadge value={actionRequest.lifecycleState} /> : null}
        </div>
        <div style={{ marginTop: 8 }}>{renderKeyValueRows(summaryRows)}</div>
      </section>

      <section className="panel">
        <div className="toolbar-row">
          <div>
            <div className="eyebrow">Bland Directive</div>
            <h2 className="section-title">Next required business step</h2>
          </div>
          {nextStep ? <StatusBadge value={nextStep.directive} /> : null}
        </div>
        <div style={{ marginTop: 8 }}>
          {renderKeyValueRows([
            { label: "Directive", value: nextStep?.directive ?? "none" },
            { label: "Original Bland directive", value: returnedNextStep?.directive ?? "none" },
            { label: "Reason code", value: nextStep?.reasonCode ?? "none" },
            { label: "Required fields", value: nextStep?.requiredFields.join(", ") || "none" },
            {
              label: "Operator intervention",
              value: nextStep?.operatorInterventionRequired ? "required" : "not required"
            },
            { label: "Can reconcile", value: nextStep?.canReconcile ? "yes" : "no" },
            { label: "Can retry", value: nextStep?.canRetry ? "yes" : "no" },
            { label: "Safe context", value: nextStep?.safeExplanation ?? "none" }
          ])}
        </div>
        {actionRequest ? (
          <div style={{ marginTop: 14 }}>
            <ActionRequestControls actionRequestId={actionRequest.id} lifecycleState={actionRequest.lifecycleState} />
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="eyebrow">Core Loop</div>
        <h2 className="section-title">Deployment trace</h2>
        <div className="trace-list" style={{ marginTop: 12 }}>
          {timeline.map((step, index) => {
            const stepObject = readObject(step);
            const stepName = displayValue(stepObject?.step);
            const rawStatus = displayValue(stepObject?.status);
            const displayStatus =
              stepName === "policy_evaluated" && displayValue(stepObject?.outputSummary).includes("approval_required")
                ? "approval_pending"
                : rawStatus;
            const stepGuardrails = Array.isArray(stepObject?.guardrails) ? stepObject.guardrails : [];
            const stepReasons = Array.isArray(stepObject?.reasons) ? stepObject.reasons : [];
            return (
              <div key={`${stepName}-${index}`} className="trace-step">
                <span className="trace-index">{index + 1}</span>
                <div>
                  <strong>{formatLabel(stepName)}</strong>
                  <p style={{ margin: "6px 0 0" }}>{displayValue(stepObject?.outputSummary)}</p>
                  <div className="subtle" style={{ marginTop: 6 }}>
                    {stepReasons.length > 0 ? stepReasons.join(" | ") : "No additional reasons"}
                    {stepGuardrails.length > 0 ? ` | guardrails: ${stepGuardrails.join(", ")}` : ""}
                  </div>
                </div>
                <StatusBadge value={displayStatus} />
              </div>
            );
          })}
        </div>
      </section>

      {adapterAttempts.length > 0 ? (
        <section className="panel">
          <div className="eyebrow">Downstream Adapter</div>
          <h2 className="section-title">Failure and recovery evidence</h2>
          <div className="table-wrap">
            <table className="table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Adapter</th>
                  <th>Failure mode</th>
                  <th>Status</th>
                  <th>Response</th>
                </tr>
              </thead>
              <tbody>
                {adapterAttempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{attempt.attemptNumber}</td>
                    <td>{attempt.adapterName}</td>
                    <td>{attempt.failureMode}</td>
                    <td><StatusBadge value={attempt.status} /></td>
                    <td className="truncate-cell mono">{JSON.stringify(attempt.responsePayload)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="panel">
          <div className="eyebrow">Extracted Fields</div>
          <h2 className="section-title">Structured request</h2>
          {renderKeyValueRows([
            ...extractedFieldRows,
            {
              label: "Missing fields",
              value:
                Array.isArray(extractionObject?.missingFields) && extractionObject.missingFields.length > 0
                  ? extractionObject.missingFields.join(", ")
                  : "none"
            },
            { label: "Extraction mode", value: displayValue(extractionObject?.mode) },
            { label: "Extraction source", value: displayValue(extractionObject?.source) },
            {
              label: "Confidence",
              value:
                extractionObject?.confidence !== null && extractionObject?.confidence !== undefined
                  ? String(extractionObject.confidence)
                  : "none"
            },
            {
              label: "Validation errors",
              value:
                Array.isArray(extractionObject?.validationErrors) && extractionObject.validationErrors.length > 0
                  ? extractionObject.validationErrors.join(" | ")
                  : "none"
            }
          ])}
        </div>

        <div className="panel">
          <div className="eyebrow">Policy Checks</div>
          <h2 className="section-title">Why the decision happened</h2>
          <div className="grid">
            {policyChecks.map((check, index) => {
              const checkObject = readObject(check);
              const passed = Boolean(checkObject?.passed);
              return (
                <div key={`${displayValue(checkObject?.name)}-${index}`} className="detail-card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>{formatLabel(displayValue(checkObject?.name))}</strong>
                    <span className={`tag ${passed ? "status-allowed" : "status-blocked"}`}>
                      {passed ? "Passed" : "Failed"}
                    </span>
                  </div>
                  <p style={{ marginTop: 10, marginBottom: 0 }}>{displayValue(checkObject?.reason)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="panel">
          <div className="eyebrow">Action Result</div>
          <h2 className="section-title">Final decision</h2>
          {renderKeyValueRows([
            { label: "Action name", value: interaction.actionAttempted },
            { label: "Final outcome", value: currentOutcome },
            { label: "Decision", value: interaction.policyDecision },
            { label: "Requisition", value: displayValue(actionRequest?.resultPayload?.requisitionId ?? responseBody?.relatedRecords.requisitionId) },
            { label: "Approval", value: responseBody?.relatedRecords.approvalRequestId ?? "none" },
            { label: "Escalation", value: responseBody?.relatedRecords.siteIssueId ?? "none" },
            { label: "PO record", value: responseBody?.relatedRecords.purchaseOrderId ?? "none" },
            { label: "Bland directive", value: nextStep?.directive ?? "none" },
            { label: "Follow-up", value: followup?.message ?? "none" },
            {
              label: "Errors",
              value:
                Array.isArray(responseBody?.errors) && responseBody.errors.length > 0
                  ? responseBody.errors.map((error) => `${error.code}: ${error.message}`).join(" | ")
                  : "none"
            }
          ])}
        </div>

        <div className="panel">
          <div className="eyebrow">Guardrails</div>
          <h2 className="section-title">Safety signals</h2>
          <div className="grid">
            {guardrails.length > 0 ? (
              guardrails.map((guardrail) => (
                <div key={guardrail.id} className="detail-card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>{formatLabel(guardrail.code)}</strong>
                    <StatusBadge value="blocked" />
                  </div>
                  <p style={{ marginTop: 10, marginBottom: 0 }}>{guardrail.reason}</p>
                </div>
              ))
            ) : (
              <div className="detail-card">No guardrails were triggered.</div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="eyebrow">Raw Technical Data</div>
        <h2 className="section-title">Expand for JSON</h2>
        <div className="grid">
          <details className="detail-card">
            <summary>Raw extraction JSON</summary>
            <pre>{JSON.stringify({ extraction: extractionSnapshot, fields: extractedFields }, null, 2)}</pre>
          </details>
          <details className="detail-card">
            <summary>Raw policy JSON</summary>
            <pre>{JSON.stringify(policySnapshot, null, 2)}</pre>
          </details>
          <details className="detail-card">
            <summary>Raw action trace JSON</summary>
            <pre>{JSON.stringify(actions, null, 2)}</pre>
          </details>
          <details className="detail-card">
            <summary>Raw webhook trace JSON</summary>
            <pre>{JSON.stringify(webhooks, null, 2)}</pre>
          </details>
          <details className="detail-card">
            <summary>Raw timeline JSON</summary>
            <pre>{JSON.stringify(timeline, null, 2)}</pre>
          </details>
          <details className="detail-card">
            <summary>Raw interaction JSON</summary>
            <pre>{JSON.stringify(interaction, null, 2)}</pre>
          </details>
        </div>
      </section>
    </main>
  );
}
