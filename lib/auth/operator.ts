import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const OPERATOR_SECRET_HEADER = "x-operator-secret";

/**
 * Synthetic identity. It says the caller held the shared operator secret, nothing about who they
 * are; audit rows carry this label instead of a fabricated employee id.
 */
export const DEMO_OPERATOR_ID = "demo_operator";

function secretsMatch(provided: string, expected: string) {
  const digest = (value: string) => crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Guards privileged routes (approvals, reconciliation/retry, demo runners, reset/seed, legacy
 * action routes). With OPERATOR_API_SECRET set, the request must carry it in `x-operator-secret`.
 * With no secret configured the routes are open outside production (local demo/tests) and closed
 * in production.
 */
export function requireOperator(
  request: Request
): { ok: true; actorId: typeof DEMO_OPERATOR_ID } | { ok: false; response: NextResponse } {
  const configured = process.env.OPERATOR_API_SECRET;

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            errors: [{ code: "operator_api_disabled", message: "Set OPERATOR_API_SECRET to enable operator routes." }]
          },
          { status: 403 }
        )
      };
    }
    return { ok: true, actorId: DEMO_OPERATOR_ID };
  }

  const provided = request.headers.get(OPERATOR_SECRET_HEADER);
  if (!provided || !secretsMatch(provided, configured)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, errors: [{ code: "operator_auth_required", message: "Missing or invalid operator secret." }] },
        { status: 401 }
      )
    };
  }

  return { ok: true, actorId: DEMO_OPERATOR_ID };
}
