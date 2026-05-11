import { getRepository } from "@/lib/db/repository";

export async function findEscalationByIdempotency(idempotencyKey: string) {
  return getRepository().findEscalationByIdempotency(idempotencyKey);
}

export async function createSiteIssue(input: {
  interactionId: string;
  callerUserId: string;
  siteName: string;
  issueSummary: string;
  idempotencyKey: string;
}) {
  return getRepository().createSiteIssue(input);
}
