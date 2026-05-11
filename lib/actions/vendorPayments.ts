import { getRepository } from "@/lib/db/repository";

export async function getVendorPaymentStatus(vendorName: string) {
  return getRepository().getVendorPaymentStatus(vendorName);
}
