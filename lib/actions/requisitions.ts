import { getRepository } from "@/lib/db/repository";

interface CreateRequisitionInput {
  interactionId: string;
  callerUserId: string;
  siteName: string;
  materialName: string;
  quantity: number;
  neededBy: string;
  idempotencyKey: string;
}

export async function findDuplicateMaterialRequest(input: {
  callerUserId: string;
  siteId: string;
  materialName: string;
  quantity: number;
  neededBy: string;
}) {
  return getRepository().findDuplicateMaterialRequest(input);
}

export async function findRequisitionByIdempotency(idempotencyKey: string) {
  return getRepository().findRequisitionByIdempotency(idempotencyKey);
}

export async function createRequisition(input: CreateRequisitionInput) {
  return getRepository().createRequisition(input);
}
