import { getMissingFields, normalizeNeededBy, normalizeTranscript } from "@/lib/extraction/shared";
import {
  blandVariablesSchema,
  extractionResultSchema,
  type BlandVariables,
  type ExtractionResult
} from "@/lib/extraction/types";

function normalizeBoolean(value: boolean | string | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["true", "yes", "1"].includes(value.toLowerCase());
  }

  return undefined;
}

export function extractFromBlandVariables(transcript: string, variables?: BlandVariables): ExtractionResult {
  const parsed = blandVariablesSchema.safeParse(variables ?? {});
  const normalizedTranscript = normalizeTranscript(transcript);

  if (!parsed.success) {
    return extractionResultSchema.parse({
      intent: "unknown",
      confidence: null,
      fields: {},
      missingFields: [],
      rawExtractionSource: "bland_variables",
      normalizedTranscript,
      extractionWarnings: ["invalid_bland_variables_payload"],
      validationErrors: parsed.error.issues.map((issue) => issue.message),
      extractionFailed: true
    });
  }

  const source = parsed.data;
  const fields = {
    siteName: source.siteName ?? source.site_name,
    materialName: source.materialName ?? source.material_name,
    quantity:
      typeof source.quantity === "number"
        ? source.quantity
        : typeof source.quantity === "string" && source.quantity.trim()
          ? Number(source.quantity)
          : undefined,
    neededBy: source.neededBy ?? source.needed_by ?? normalizeNeededBy(normalizedTranscript),
    urgency: source.urgency,
    poCode: source.poCode ?? source.po_code,
    vendorName: source.vendorName ?? source.vendor_name,
    issueSummary: source.issueSummary ?? source.issue_summary,
    bypassAttempt: normalizeBoolean(source.bypassAttempt ?? source.bypass_attempt)
  };

  const intent = source.intent ?? "unknown";
  return extractionResultSchema.parse({
    intent,
    confidence: 0.99,
    fields,
    missingFields: getMissingFields(intent, fields),
    rawExtractionSource: "bland_variables",
    normalizedTranscript,
    extractionWarnings: [],
    validationErrors: [],
    extractionFailed: false
  });
}
