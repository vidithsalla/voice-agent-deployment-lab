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
- Write actions use idempotency keys, and reuse of a key for a different request is refused.
- Blocked and routed actions still generate audit traces.

## Idempotency Strategy

Every write-capable action is claimed by a persisted action request keyed by an idempotency key, and stores a fingerprint of the normalized request (intent plus extracted fields).

- Same key, same fingerprint: the existing result is replayed and nothing is written again.
- Same key, different fingerprint: the request is blocked (`idempotency_key_conflict`, `handoff_to_human`, reason `IDEMPOTENCY_CONFLICT`). It is never replayed or executed, and the original record is untouched.
- The Bland webhook uses `call_id` plus a hash of the fingerprint as the key, so one call can carry several distinct actions while redelivery of the same one replays.
- In Postgres, unique indexes on `idempotency_key` for action requests, requisitions, approval requests, and site issues make the write itself atomic; a concurrent duplicate inserts nothing and reads back the existing row. Approval, rejection, and retry are compare-and-set transitions on the action request state, so two concurrent operators cannot both execute.

Scope: this covers the modelled workflow (material requests, approvals, escalations). It is not a general exactly-once guarantee. A process that dies while an action is `executing` leaves it in that state until an operator intervenes, and the mock ERP is simulated in the same database.

## Reconciliation

When a write's outcome is unknown, the action moves to `reconciliation_required` and cannot be retried. Reconciling queries the downstream (the mock ERP, by correlation key) and derives the result: found, so the action is `recovered` with no second write; not found, so a retry becomes allowed; unavailable, so `human_review_required`. Callers cannot supply the outcome. Retry re-checks downstream immediately before writing. A negative lookup is treated as evidence of no mutation, which is only as good as the downstream's read consistency; a real ERP integration would need to define that.

## Operator And Demo Routes

Approve, reject, reconcile, retry, `/api/demo/*`, and the legacy `/api/actions/*` routes require the `x-operator-secret` header to match `OPERATOR_API_SECRET` (constant-time comparison). With no secret set they are open in local development and return 403 in production. This is a single shared secret, not user authentication: audit rows record the synthetic actor `demo_operator`, never a named employee. The Bland webhook secret and the operator secret are separate.

## Audit Log Strategy

Every orchestration run records:

- interaction record
- top-level action log
- webhook event
- guardrail events when applicable
- follow-up record

Write-side sub-actions also emit their own trace rows, such as requisition creation, approval creation, escalation creation, and follow-up persistence.

## Webhook Verification

`POST /api/bland/webhook` requires `x-bland-webhook-secret` to equal `BLAND_WEBHOOK_SECRET` (constant-time comparison). This is the header verified from a Bland Console Webhook node; no other header or signature scheme is accepted.

- missing or incorrect secret: `401`
- no secret configured: accepted outside production (local use and tests), rejected in production
- `request_data.customer_key` must name a known customer configuration or the request is handed to a human without any action

## Finance And Sensitive Data Handling

Vendor payment status is treated as sensitive read-only data.

- finance analyst and procurement manager can view it
- site manager, field engineer, guest, and unknown callers cannot

Unauthorized callers receive a blocked response and audit trace, not partial payment details.

## Known Failure Modes

- deterministic extraction can still misread messy real transcripts
- LLM extraction is optional and not exercised in this environment without `OPENAI_API_KEY`
- Bland variable ingestion is validated, but it still depends on the upstream pathway collecting the right fields
- Postgres proof depends on `DATABASE_URL`; memory mode remains a local fallback and is silent on a deployment without it
- resetting a configured Postgres database (`db:seed`, `verify:db`, evals against Postgres) is refused unless `ALLOW_DESTRUCTIVE_DB_RESET=1`
- approval expiry is not implemented

## Why This Matters For Enterprise Voice

The hard part is not getting the model to say the right sentence. The hard part is making sure a phone call cannot silently create the wrong purchase request, leak finance data, or bypass approval. This harness is designed around those failure modes.
