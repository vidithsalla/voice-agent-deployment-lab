import { getRepository } from "@/lib/db/repository";

export async function findMaterialByName(materialName: string) {
  return getRepository().findMaterialByName(materialName);
}
