import { NextResponse } from "next/server";
import { badRequest, parseJson } from "@/lib/api";
import { handleBlandWebhook, verifyBlandWebhookSecret } from "@/lib/bland/adapter";
import { blandWebhookRequestSchema } from "@/lib/schemas/actions";

export async function POST(request: Request) {
  const signature =
    request.headers.get("x-bland-webhook-secret") ?? request.headers.get("authorization");
  if (!verifyBlandWebhookSecret(signature)) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ code: "invalid_webhook_secret", message: "Webhook secret verification failed." }]
      },
      { status: 401 }
    );
  }

  const parsed = await parseJson(request, blandWebhookRequestSchema);
  if (!parsed.success) {
    return badRequest([{ code: "invalid_request", message: parsed.error.message }]);
  }

  return NextResponse.json(await handleBlandWebhook(parsed.data));
}
