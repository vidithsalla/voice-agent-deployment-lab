import { z } from "zod";
import { extractedFieldsSchema, intentSchema } from "@/lib/schemas/voice";

export const extractionModeSchema = z.enum(["deterministic", "llm", "bland_variables"]);
export const extractionSourceSchema = z.enum(["deterministic", "llm", "bland_variables"]);

export const blandVariablesSchema = z.object({
  intent: intentSchema.optional(),
  site_name: z.string().optional(),
  siteName: z.string().optional(),
  material_name: z.string().optional(),
  materialName: z.string().optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  needed_by: z.string().optional(),
  neededBy: z.string().optional(),
  urgency: z.string().optional(),
  po_code: z.string().optional(),
  poCode: z.string().optional(),
  vendor_name: z.string().optional(),
  vendorName: z.string().optional(),
  issue_summary: z.string().optional(),
  issueSummary: z.string().optional(),
  bypass_attempt: z.union([z.boolean(), z.string()]).optional(),
  bypassAttempt: z.union([z.boolean(), z.string()]).optional()
});

export const extractionResultSchema = z.object({
  intent: intentSchema,
  confidence: z.number().min(0).max(1).nullable().optional(),
  fields: extractedFieldsSchema,
  missingFields: z.array(z.string()),
  rawExtractionSource: extractionSourceSchema,
  normalizedTranscript: z.string(),
  extractionWarnings: z.array(z.string()),
  validationErrors: z.array(z.string()),
  extractionFailed: z.boolean().default(false)
});

export type ExtractionMode = z.infer<typeof extractionModeSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type BlandVariables = z.infer<typeof blandVariablesSchema>;

export interface ExtractVoiceRequestInput {
  transcript: string;
  mode?: ExtractionMode;
  blandVariables?: BlandVariables;
}
