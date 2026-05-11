import { extractFromBlandVariables } from "@/lib/extraction/blandVariables";
import { extractDeterministically } from "@/lib/extraction/deterministic";
import { extractWithLlm } from "@/lib/extraction/llm";
import {
  extractionModeSchema,
  type ExtractVoiceRequestInput,
  type ExtractionMode,
  type ExtractionResult
} from "@/lib/extraction/types";

export function resolveExtractionMode(mode?: ExtractionMode) {
  const value = mode ?? process.env.EXTRACTION_MODE ?? "deterministic";
  const parsed = extractionModeSchema.safeParse(value);
  return parsed.success ? parsed.data : "deterministic";
}

export async function extractVoiceRequest(input: ExtractVoiceRequestInput): Promise<ExtractionResult> {
  const mode = resolveExtractionMode(input.mode);

  if (mode === "bland_variables") {
    return extractFromBlandVariables(input.transcript, input.blandVariables);
  }

  if (mode === "llm") {
    return extractWithLlm(input.transcript);
  }

  return extractDeterministically(input.transcript);
}
