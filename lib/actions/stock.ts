import { getRepository } from "@/lib/db/repository";

export async function checkStock(siteName: string, materialName: string) {
  return getRepository().checkStock(siteName, materialName);
}
