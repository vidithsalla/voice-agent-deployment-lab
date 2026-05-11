import { getRepository } from "@/lib/db/repository";

export async function getPurchaseOrderStatus(poCode: string) {
  return getRepository().getPurchaseOrderStatus(poCode);
}
