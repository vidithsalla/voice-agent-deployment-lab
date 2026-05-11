import { extractDeterministically } from "@/lib/extraction/deterministic";

export type ExtractedFields = ReturnType<typeof extractDeterministically>["fields"];

export function extractIntentAndFields(transcript: string) {
  const extracted = extractDeterministically(transcript);
  return {
    intent: extracted.intent,
    fields: extracted.fields
  };
}
