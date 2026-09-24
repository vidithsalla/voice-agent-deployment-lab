# External Evidence

Public claim these files support, and nothing broader:

> Verified against real Bland Console API execution with authenticated VoiceLab webhook handling and Neon-backed persistence.

The temporary Vercel deployments, Bland Pathways, and temporary Neon resources used for the runs were deleted afterwards. Secrets and temporary deployment hosts are redacted. Direct control calls are curl preflights, not Bland calls.

## Start here

**[`hardened-bland-tools-runtime-verification.json`](hardened-bland-tools-runtime-verification.json)** is the strongest current artifact. It holds the final 2026-09-24 hardened-runtime proof: dedicated temporary Neon schema/seed verification, direct authenticated preflight, live Bland Console Tools / Custom API execution, idempotent replay, backend correlation, and cleanup.

## What each file proves

| File | What it proves | What it does not prove |
|---|---|---|
| `hardened-bland-tools-runtime-verification.json` | Current hardened code ran against an isolated temporary Neon database and a temporary Vercel deployment. A live Bland Console Tools / Custom API test reached VoiceLab with `x-bland-webhook-secret`, returned `status=success`, and replayed idempotently without creating duplicate requisitions. | Live phone calls, production traffic, a permanent deployment, or paid Bland usage. Bland redirected the legacy Webhook-node setup toward its current Tools / Custom API flow. |
| `ui-bland-webhook-real-test.json` | A Bland Webhook node reached VoiceLab with the shared-secret header, got a `continue` directive, and the resulting action and requisition were read back from Neon by call id. The correlation block is a recorded query result, not something a reader can re-run. | Phone calls, Pathway routing on any directive other than `continue`, Bland Agent Testing, a real ERP, production traffic. |
| `ui-direct-control-latest.json` | A direct authenticated request (not from Bland) to the same temporary deployment returned the same contract. It is a control that separates "the deployment works" from "Bland's node works". | Anything about Bland. It used a different header than the one verified from Bland, and that header is no longer accepted by the code. |
| `neon-readonly-verification.json` | Read-only checks of the Neon schema and row counts on 2026-09-15, plus persistence of the direct-control call. | The Bland-to-Neon correlation. It predates the Bland test and does not reference the Bland call id. |
| `ui-bland-webhook-real-test-cleanup.json` | The temporary Bland Pathway was deleted. | |
| `ui-temp-deployment-cleanup.json` | The temporary Vercel project and deployment were removed; the endpoint no longer serves. | |

## Not verified

Live phone deployment, real customer traffic, Pathway routing across every directive, Bland Agent Testing, a real ERP integration, production readiness.

## Current status

The current hardened code has been re-run against a dedicated temporary Neon database and Bland Console execution. The legacy Webhook-node evidence remains historical; the latest Bland Console test used Bland's current Tools / Custom API surface after the Console redirected Webhook-node setup toward Tools.
