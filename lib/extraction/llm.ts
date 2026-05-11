import { getMissingFields, normalizeTranscript } from "@/lib/extraction/shared";
import { extractionResultSchema, type ExtractionResult } from "@/lib/extraction/types";

const llmExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: [
        "create_material_request",
        "check_stock",
        "check_po_status",
        "check_vendor_payment",
        "escalate_site_issue",
        "unknown"
      ]
    },
    confidence: { type: ["number", "null"] },
    fields: {
      type: "object",
      additionalProperties: false,
      properties: {
        siteName: { type: "string" },
        materialName: { type: "string" },
        quantity: { type: "number" },
        neededBy: { type: "string" },
        urgency: { type: "string" },
        poCode: { type: "string" },
        vendorName: { type: "string" },
        issueSummary: { type: "string" },
        bypassAttempt: { type: "boolean" }
      }
    },
    extractionWarnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["intent", "fields"]
};

function extractionFailure(transcript: string, warning: string, details?: string[]) {
  return extractionResultSchema.parse({
    intent: "unknown",
    confidence: null,
    fields: {},
    missingFields: [],
    rawExtractionSource: "llm",
    normalizedTranscript: normalizeTranscript(transcript),
    extractionWarnings: [warning],
    validationErrors: details ?? [],
    extractionFailed: true
  });
}

export async function extractWithLlm(transcript: string): Promise<ExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return extractionFailure(transcript, "llm_api_key_missing");
  }

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "voice_action_extraction",
            schema: llmExtractionSchema
          }
        },
        messages: [
          {
            role: "system",
            content:
              "Extract only intent and structured fields from a business voice transcript. Do not authorize anything. Return JSON only."
          },
          {
            role: "user",
            content: transcript
          }
        ]
      })
    });

    if (!response.ok) {
      return extractionFailure(transcript, "llm_http_error", [String(response.status)]);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return extractionFailure(transcript, "llm_empty_response");
    }

    const parsed = JSON.parse(content) as {
      intent: ExtractionResult["intent"];
      confidence?: number | null;
      fields: ExtractionResult["fields"];
      extractionWarnings?: string[];
    };

    return extractionResultSchema.parse({
      intent: parsed.intent,
      confidence: parsed.confidence ?? null,
      fields: parsed.fields,
      missingFields: getMissingFields(parsed.intent, parsed.fields),
      rawExtractionSource: "llm",
      normalizedTranscript: normalizeTranscript(transcript),
      extractionWarnings: parsed.extractionWarnings ?? [],
      validationErrors: [],
      extractionFailed: false
    });
  } catch (error) {
    return extractionFailure(transcript, "llm_parse_or_network_error", [
      error instanceof Error ? error.message : "unknown_llm_error"
    ]);
  }
}
