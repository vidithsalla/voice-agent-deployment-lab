import { runVoiceAction } from "@/lib/actions/action-gateway";
import type { ExtractionMode } from "@/lib/extraction/types";
import { getRepository } from "@/lib/db/repository";
import type { ActionEnvelope } from "@/lib/schemas/actions";
import type { ScenarioGroupSpec, ScenarioRunSpec } from "@/lib/verification/scenarios";

export interface ScenarioTrace {
  runId: string;
  transcript: string;
  callerPhone: string;
  response: ActionEnvelope;
  interactionFound: boolean;
  actionLogIds: string[];
  webhookEventIds: string[];
  guardrailEventIds: string[];
  requisitionIds: string[];
  approvalIds: string[];
  siteIssueIds: string[];
  followupId: string | null;
  passed: boolean;
  notes: string[];
}

export interface ScenarioGroupTrace {
  groupId: string;
  label: string;
  description: string;
  passed: boolean;
  notes: string[];
  traces: ScenarioTrace[];
}

interface RunScenarioGroupOptions {
  resetBeforeGroup?: boolean;
  extractionMode?: ExtractionMode;
}

function compareFields(expected: Record<string, unknown> | undefined, actual: Record<string, unknown>) {
  if (!expected) {
    return true;
  }

  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

async function runScenarioTrace(run: ScenarioRunSpec, options: RunScenarioGroupOptions = {}): Promise<ScenarioTrace> {
  const repo = getRepository();
  const response = await runVoiceAction({
    interactionId: run.id,
    callerPhone: run.callerPhone,
    transcript: run.transcript,
    idempotencyKey: run.idempotencyKey ?? `trace-${run.id}`,
    extractionMode: options.extractionMode
  });

  const [interaction, actionLogs, webhookEvents, guardrailEvents, followup, requisitions, approvals, siteIssues] =
    await Promise.all([
      repo.getInteractionById(run.id),
      repo.listActionLogsByInteraction(run.id),
      repo.listWebhookEventsByInteraction(run.id),
      repo.listGuardrailsByInteraction(run.id),
      repo.getFollowupByInteraction(run.id),
      repo.listRequisitionsByInteraction(run.id),
      repo.listApprovalRequestsByInteraction(run.id),
      repo.listSiteIssuesByInteraction(run.id)
    ]);

  const notes: string[] = [];

  if (response.intent !== run.expectedIntent) {
    notes.push(`intent ${response.intent} != ${run.expectedIntent}`);
  }

  if (run.expectedAction && response.action !== run.expectedAction) {
    notes.push(`action ${response.action} != ${run.expectedAction}`);
  }

  if (run.expectedPolicyDecision && response.policyDecision !== run.expectedPolicyDecision) {
    notes.push(`policyDecision ${response.policyDecision} != ${run.expectedPolicyDecision}`);
  }

  if (run.expectedEngineDecision && response.policy.engineDecision !== run.expectedEngineDecision) {
    notes.push(`engineDecision ${response.policy.engineDecision} != ${run.expectedEngineDecision}`);
  }

  const actualGuardrails = response.guardrails.map((item) => item.code).sort();
  const expectedGuardrails = [...run.expectedGuardrails].sort();
  if (JSON.stringify(actualGuardrails) !== JSON.stringify(expectedGuardrails)) {
    notes.push(`guardrails ${actualGuardrails.join(",")} != ${expectedGuardrails.join(",")}`);
  }

  if (!compareFields(run.expectedFields, response.extractedFields)) {
    notes.push("field extraction mismatch");
  }

  if (run.expectedClarifications) {
    const actualClarifications = [...(response.policy.requiredClarifications ?? [])].sort();
    const expectedClarifications = [...run.expectedClarifications].sort();
    if (JSON.stringify(actualClarifications) !== JSON.stringify(expectedClarifications)) {
      notes.push(
        `clarifications ${actualClarifications.join(",")} != ${expectedClarifications.join(",")}`
      );
    }
  }

  if (typeof run.expectedCallerKnown === "boolean" && response.caller?.known !== run.expectedCallerKnown) {
    notes.push(`caller known ${String(response.caller?.known)} != ${String(run.expectedCallerKnown)}`);
  }

  if (Boolean(response.relatedRecords.requisitionId) !== run.shouldCreateRequisition) {
    notes.push("requisition expectation mismatch");
  }

  if (Boolean(response.relatedRecords.approvalRequestId) !== run.shouldCreateApproval) {
    notes.push("approval expectation mismatch");
  }

  if (Boolean(response.relatedRecords.siteIssueId) !== run.shouldCreateEscalation) {
    notes.push("escalation expectation mismatch");
  }

  if ((followup !== null) !== (run.shouldCreateFollowup ?? true)) {
    notes.push("follow-up expectation mismatch");
  }

  if (typeof run.expectSensitiveFinanceData === "boolean") {
    const hasFinanceData = Boolean(response.data.vendorPayment);
    if (hasFinanceData !== run.expectSensitiveFinanceData) {
      notes.push("finance visibility expectation mismatch");
    }
  }

  if ((run.minimumActionLogCount ?? 1) > actionLogs.length) {
    notes.push(`action log count ${actionLogs.length} below minimum ${run.minimumActionLogCount}`);
  }

  if ((run.minimumWebhookEventCount ?? 1) > webhookEvents.length) {
    notes.push(`webhook event count ${webhookEvents.length} below minimum ${run.minimumWebhookEventCount}`);
  }

  if (!interaction) {
    notes.push("interaction record missing");
  }

  if (run.expectedOutcomeIncludes) {
    run.expectedOutcomeIncludes.forEach((fragment) => {
      if (!response.outcome.includes(fragment)) {
        notes.push(`outcome missing fragment: ${fragment}`);
      }
    });
  }

  return {
    runId: run.id,
    transcript: run.transcript,
    callerPhone: run.callerPhone,
    response,
    interactionFound: Boolean(interaction),
    actionLogIds: actionLogs.map((item) => item.id),
    webhookEventIds: webhookEvents.map((item) => item.id),
    guardrailEventIds: guardrailEvents.map((item) => item.id),
    requisitionIds: requisitions.map((item) => item.id),
    approvalIds: approvals.map((item) => item.id),
    siteIssueIds: siteIssues.map((item) => item.id),
    followupId: followup?.id ?? null,
    passed: notes.length === 0,
    notes
  };
}

export async function runScenarioGroup(
  group: ScenarioGroupSpec,
  options: RunScenarioGroupOptions = {}
): Promise<ScenarioGroupTrace> {
  if (options.resetBeforeGroup) {
    await getRepository().resetAndSeed();
  }

  const traces: ScenarioTrace[] = [];
  const notes: string[] = [];

  for (const run of group.runs) {
    const trace = await runScenarioTrace(run, options);
    traces.push(trace);
    if (!trace.passed) {
      notes.push(`${run.id}: ${trace.notes.join("; ")}`);
    }
  }

  return {
    groupId: group.id,
    label: group.label,
    description: group.description,
    passed: notes.length === 0,
    notes,
    traces
  };
}
