import { getRepository } from "@/lib/db/repository";
import type { CallerContext } from "@/lib/db/types";

export async function resolveCaller(callerPhone: string): Promise<CallerContext | null> {
  return getRepository().resolveCallerByPhone(callerPhone);
}
