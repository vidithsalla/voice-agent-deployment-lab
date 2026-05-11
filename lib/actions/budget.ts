import { getRepository } from "@/lib/db/repository";

export async function getBudgetStatus(input: {
  siteName: string;
  materialName: string;
  quantity: number;
}) {
  return getRepository().getBudgetStatus(input);
}
