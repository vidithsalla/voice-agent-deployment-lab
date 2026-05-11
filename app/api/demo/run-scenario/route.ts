import { NextResponse } from "next/server";
import { runVoiceAction } from "@/lib/actions/action-gateway";
import { badRequest, parseJson } from "@/lib/api";
import { runScenarioRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const parsed = await parseJson(request, runScenarioRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  return NextResponse.json(
    await runVoiceAction({
      interactionId: parsed.data.scenarioId ?? `scenario-${crypto.randomUUID()}`,
      callerPhone: parsed.data.callerPhone,
      transcript: parsed.data.transcript,
      idempotencyKey: parsed.data.idempotencyKey,
      extractionMode: parsed.data.extractionMode,
      blandVariables: parsed.data.variables
    })
  );
}
