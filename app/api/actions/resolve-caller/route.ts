import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/actions/caller";
import { badRequest, parseJson } from "@/lib/api";
import { callerResolutionRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const parsed = await parseJson(request, callerResolutionRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  return NextResponse.json({
    ok: true,
    caller: await resolveCaller(parsed.data.callerPhone)
  });
}
