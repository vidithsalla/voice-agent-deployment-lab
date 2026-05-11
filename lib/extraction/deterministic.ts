import type { IntentType } from "@/lib/db/types";
import { getMissingFields, normalizeNeededBy, normalizeTranscript } from "@/lib/extraction/shared";
import { extractionResultSchema, type ExtractionResult } from "@/lib/extraction/types";

function detectIntent(normalized: string): IntentType {
  if (normalized.includes("do we have enough") || normalized.includes("check stock")) {
    return "check_stock";
  }

  if (
    (normalized.includes("has ") && normalized.includes(" been paid")) ||
    normalized.includes("payment status") ||
    normalized.includes("check payment")
  ) {
    return "check_vendor_payment";
  }

  if (normalized.includes("where is po") || normalized.includes("what happened to po-") || normalized.includes("po-")) {
    return "check_po_status";
  }

  if (normalized.includes("generator failed") || normalized.includes("work is blocked")) {
    return "escalate_site_issue";
  }

  if (
    (normalized.includes("need") || normalized.includes("create the po") || normalized.includes("create ")) &&
    (normalized.includes("cement") || normalized.includes("steel") || normalized.includes("diesel"))
  ) {
    return "create_material_request";
  }

  return "unknown";
}

export function extractDeterministically(transcript: string): ExtractionResult {
  const normalizedTranscript = normalizeTranscript(transcript);
  const normalized = normalizedTranscript.toLowerCase();
  const extractionWarnings: string[] = [];
  const fields: ExtractionResult["fields"] = {};

  const siteMatches = Array.from(
    new Set(
      (normalized.match(/site [ab]/g) ?? []).map((match) => match.replace("site ", "Site ").toUpperCase())
    )
  );
  if (siteMatches.length > 1) {
    extractionWarnings.push("conflicting_site_mentions");
  }
  if (normalized.includes("site a")) {
    fields.siteName = "Site A";
  } else if (normalized.includes("site b")) {
    fields.siteName = "Site B";
  }

  if (normalized.includes("cement")) {
    fields.materialName = "cement";
  } else if (normalized.includes("steel")) {
    fields.materialName = "steel rods";
  } else if (normalized.includes("diesel")) {
    fields.materialName = "diesel";
  }

  const quantityMatches = Array.from(normalized.matchAll(/(\d+)\s+(bags|bag|bundles|bundle|barrels|barrel)/g));
  if (quantityMatches.length > 0) {
    fields.quantity = Number(quantityMatches.at(-1)?.[1] ?? 0);
    if (quantityMatches.length > 1) {
      extractionWarnings.push("multiple_quantity_mentions_used_latest");
    }
  }

  const neededBy = normalizeNeededBy(normalizedTranscript);
  if (neededBy) {
    fields.neededBy = neededBy;
  }

  if (normalized.includes("urgent") || normalized.includes("blocked") || normalized.includes("failed")) {
    fields.urgency = "high";
  }

  const poMatch = normalizedTranscript.match(/PO-\d+/i);
  if (poMatch) {
    fields.poCode = poMatch[0].toUpperCase();
  }

  if (normalized.includes("kumar traders")) {
    fields.vendorName = "Kumar Traders";
  } else if (normalized.includes("orbit supplies")) {
    fields.vendorName = "Orbit Supplies";
  }

  if (normalized.includes("generator failed")) {
    fields.issueSummary = "Generator failed and site work is blocked.";
  } else if (normalized.includes("work is blocked")) {
    fields.issueSummary = normalizedTranscript;
  }

  if (
    normalized.includes("skip approval") ||
    normalized.includes("bypass approval") ||
    normalized.includes("don't send it for approval") ||
    normalized.includes("dont send it for approval") ||
    normalized.includes("just create the po") ||
    normalized.includes("ignore all rules") ||
    normalized.includes("don't log this") ||
    normalized.includes("dont log this") ||
    normalized.includes("use my manager's approval")
  ) {
    fields.bypassAttempt = true;
    extractionWarnings.push("conflicting_instruction_detected");
  }

  const intent = detectIntent(normalized);
  const result = {
    intent,
    confidence: 0.98,
    fields,
    missingFields: getMissingFields(intent, fields),
    rawExtractionSource: "deterministic" as const,
    normalizedTranscript,
    extractionWarnings,
    validationErrors: [],
    extractionFailed: false
  };

  return extractionResultSchema.parse(result);
}
