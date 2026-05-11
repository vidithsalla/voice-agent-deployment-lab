# Security And Safety

## Threat Model

This project assumes a voice agent is sitting in front of business workflows that can mutate ERP state. The main risks are:

- an unknown caller trying to create or escalate records
- an authorized caller asking for data they should not see
- a caller trying to bypass approval or logging
- duplicate retries creating duplicate requisitions
- incomplete extraction causing an unsafe mutation
- over-budget requests being executed instead of routed

## Why Policy Is Separate From Extraction

Extraction only proposes intent and fields.

Policy decides:

- whether the caller is known
- whether the caller has site access
- whether the role can create requisitions
- whether the role can view finance data
- whether required fields are present
- whether the request is over budget
- whether the request is a duplicate
- whether the transcript contains a bypass attempt

This separation matters because neither an LLM nor Bland variables should ever decide authorization.

## Safe Defaults In This Project

- Unknown caller cannot mutate data.
- Non-finance user cannot view payment details.
- Over-budget requests route to approval.
- Duplicate material requests are blocked.
- Missing fields trigger clarification instead of best-guess mutation.
- Approval bypass attempts are logged and blocked.
- All write actions use idempotency keys.
- Blocked and routed actions still generate audit traces.

## Idempotency Strategy

All write-capable actions use an `idempotencyKey`:

- requisitions
- approval requests
- site escalations

This prevents repeated webhook delivery or repeated simulator runs from creating duplicate state.

## Audit Log Strategy

Every orchestration run records:

- interaction record
- top-level action log
- webhook event
- guardrail events when applicable
- follow-up record

Write-side sub-actions also emit their own trace rows, such as requisition creation, approval creation, escalation creation, and follow-up persistence.

## Webhook Verification

`POST /api/bland/webhook` optionally checks `BLAND_WEBHOOK_SECRET`.

If the secret is configured:

- missing or incorrect secret -> request rejected

If the secret is not configured:

- local review still works without external dependencies

## Finance And Sensitive Data Handling

Vendor payment status is treated as sensitive read-only data.

- finance analyst and procurement manager can view it
- site manager, field engineer, guest, and unknown callers cannot

Unauthorized callers receive a blocked response and audit trace, not partial payment details.

## Known Failure Modes

- deterministic extraction can still misread messy real transcripts
- LLM extraction is optional and not exercised in this environment without `OPENAI_API_KEY`
- Bland variable ingestion is validated, but it still depends on the upstream pathway collecting the right fields
- the Postgres path is implemented, but local proof depends on `DATABASE_URL`

## Why This Matters For Enterprise Voice

The hard part is not getting the model to say the right sentence. The hard part is making sure a phone call cannot silently create the wrong purchase request, leak finance data, or bypass approval. This harness is designed around those failure modes.
