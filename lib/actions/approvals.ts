import { getRepository } from "@/lib/db/repository";

export async function findApprovalByIdempotency(idempotencyKey: string) {
  return getRepository().findApprovalByIdempotency(idempotencyKey);
}

export async function requestApproval(input: {
  interactionId: string;
  callerUserId: string;
  siteName: string;
  reason: string;
  idempotencyKey: string;
}) {
  return getRepository().createApprovalRequest(input);
}
