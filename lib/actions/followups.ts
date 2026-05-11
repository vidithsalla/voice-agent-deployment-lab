import { getRepository } from "@/lib/db/repository";

export async function saveFollowup(input: {
  orgId: string;
  interactionId: string;
  message: string;
}) {
  return getRepository().saveFollowup(input);
}

export function buildFollowupMessage(input: {
  callerName: string | null;
  policyDecision: string;
  outcome: string;
}) {
  const prefix = input.callerName ? `${input.callerName},` : "Team,";

  if (input.policyDecision === "allowed") {
    return `${prefix} your voice request was completed: ${input.outcome}`;
  }

  if (input.policyDecision === "approval_required") {
    return `${prefix} your request was routed for approval: ${input.outcome}`;
  }

  if (input.policyDecision === "clarification_needed") {
    return `${prefix} we need more details before taking action: ${input.outcome}`;
  }

  return `${prefix} we could not complete the request: ${input.outcome}`;
}
