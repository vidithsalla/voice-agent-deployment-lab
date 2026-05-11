import type { GuardrailCode, IntentType, PolicyDecision } from "@/lib/db/types";
import { getRepository } from "@/lib/db/repository";

export async function createInteraction(input: {
  interactionId: string;
  orgId: string;
  siteId: string | null;
  callerPhone: string;
  callerId: string | null;
  transcript: string;
  intent: IntentType;
  extractedFields: Record<string, unknown>;
  actionAttempted: string;
  policyDecision: PolicyDecision;
  outcome: string;
}) {
  await getRepository().createInteraction(input);
}

export async function createActionLog(input: {
  orgId: string;
  interactionId: string;
  actionName: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}) {
  await getRepository().createActionLog(input);
}

export async function createWebhookEvent(input: {
  orgId: string;
  interactionId: string;
  actionName: string;
  requestBody: Record<string, unknown>;
  responseBody: Record<string, unknown>;
}) {
  await getRepository().createWebhookEvent(input);
}

export async function createGuardrailEvents(input: {
  orgId: string;
  interactionId: string;
  guardrails: Array<{ code: GuardrailCode; reason: string }>;
}) {
  await getRepository().createGuardrailEvents(input);
}
