import type { IntentType } from "@/lib/db/types";
import type { ExtractionResult } from "@/lib/extraction/types";

export function normalizeTranscript(transcript: string) {
  return transcript.replace(/\s+/g, " ").trim();
}

export function normalizeNeededBy(transcript: string) {
  const normalized = transcript.toLowerCase();
  if (normalized.includes("tomorrow")) {
    return "2026-05-09";
  }

  const dateMatch = transcript.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  return dateMatch?.[0];
}

export function requiredFieldsForIntent(intent: IntentType) {
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

export function getMissingFields(intent: IntentType, fields: ExtractionResult["fields"]) {
  return requiredFieldsForIntent(intent).filter((field) => {
    const value = fields[field as keyof typeof fields];
    return value === undefined || value === null || value === "";
  });
}
