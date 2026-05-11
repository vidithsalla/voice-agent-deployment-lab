import { getRepository } from "@/lib/db/repository";

export async function findSiteByName(siteName: string) {
  return getRepository().findSiteByName(siteName);
}
