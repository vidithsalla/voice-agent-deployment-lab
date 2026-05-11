import type { GuardrailCode, IntentType } from "@/lib/db/types";
import type { CallerContext } from "@/lib/db/types";
import type { ExtractedFields } from "@/lib/simulator/extraction";

export function requiredFieldsForIntent(intent: IntentType): Array<keyof ExtractedFields> {
  switch (intent) {
    case "create_material_request":
      return ["siteName", "materialName", "quantity", "neededBy"];
    case "check_stock":
      return ["siteName", "materialName"];
    case "check_po_status":
      return ["poCode"];
    case "check_vendor_payment":
      return ["vendorName"];
    case "escalate_site_issue":
      return ["siteName", "issueSummary"];
    default:
      return [];
  }
}

export function hasRequiredFields(intent: IntentType, fields: ExtractedFields): boolean {
  return requiredFieldsForIntent(intent).every((field) => {
    const value = fields[field];
    return value !== undefined && value !== null && value !== "";
  });
}

export function roleCanCreateRequisition(caller: CallerContext | null): boolean {
  return caller?.role === "site_manager" || caller?.role === "procurement_manager";
}

export function roleCanViewFinance(caller: CallerContext | null): boolean {
  return caller?.role === "finance_analyst" || caller?.role === "procurement_manager";
}

export function siteAccessAllowed(caller: CallerContext | null, siteId: string | null): boolean {
  if (!caller || !siteId) {
    return false;
  }

  return caller.siteIds.includes(siteId);
}

export function duplicateGuardrail(reason = "A matching request already exists."): {
  code: GuardrailCode;
  reason: string;
} {
  return { code: "duplicate_request", reason };
}
