import { requireOperator } from "@/lib/auth/operator";
import { NextResponse } from "next/server";
import { badRequest, parseJson } from "@/lib/api";
import { extractIntentRequestSchema } from "@/lib/schemas/actions";
import { extractVoiceRequest } from "@/lib/extraction";

export async function POST(request: Request) {
  const auth = requireOperator(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJson(request, extractIntentRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  return NextResponse.json({
    ok: true,
    ...(await extractVoiceRequest({
      transcript: parsed.data.transcript,
      mode: parsed.data.extractionMode,
      blandVariables: parsed.data.variables
    }))
  });
}
