# V2 Pre-Build Decisions

## Current Repo Baseline

Branch: `main`, tracking `origin/main`.

Remote: `https://github.com/vidithsalla/voice-agent-deployment-lab`.

`git fetch origin --dry-run` completed with no advertised updates on 2026-08-26, so the local branch appears current with the configured remote. The worktree already contained uncommitted edits improving simulator modes, call detail trace presentation, eval summary display, and demo wording. V2 work will preserve and build on those local edits.

## Official Bland Findings

Bland Pathways are versioned. The pathway id is stable, edits happen on a draft, production calls keep using the published production version, and specific calls can target a version number when needed.

Bland Pathways expose built-in variables including caller/callee numbers, `call_id`, and timestamps. Pathway `request_data` can inject custom variables into a call or pathway chat.

Bland webhook nodes can extract variables before invoking the webhook. Webhook configuration includes method, URL, timeout, retries, optional response data mapping, and response-based routing. HTTP-code routing requires response data to be enabled; otherwise the webhook behaves asynchronously.

Bland Tools in Pathways are explicitly mapped from extracted variables and system variables. The agent does not autonomously fill arbitrary tool fields in Pathway mode.

Bland Secrets can be referenced in webhook authorization and headers. Webhooks can be signed with HMAC SHA-256 in `X-Webhook-Signature`.

Bland Agent Testing scenarios can assert variable extraction, node traversal, webhook invocation, regex/string checks, and LLM-judged behavior. Scenarios can run in batches and required promotion gates can block production promotion.

## Product Decisions

VoiceLab will be positioned as a deployment gateway. The README, UI, docs, and test names must stop presenting deterministic policy regression as complete voice-agent accuracy.

Owner decisions selected after the V2 design review:

- AI may interpret, normalize, and propose candidate facts; deterministic code authorizes actions.
- Missing required business facts cause clarification first. If clarification is unavailable, the request moves to human review.
- Required facts are not inferred. Normalization such as converting "twenty bags" to `20` is allowed; inventing a missing quantity or site is not.
- Reads and writes have different retry semantics. Read-only operations may use bounded retry. Mutating operations may retry only after VoiceLab establishes that no downstream mutation occurred.
- Unknown write outcomes require reconciliation before retry. A lost response after a mutating request is not equivalent to "safe to retry."
- Operator controls should approve, reject, reconcile, or retry only when state permits. There is no generic bypass/override button.
- Customer policy must influence enforcement through explicit tenant configuration, not through hardcoded universal behavior.
- VoiceLab returns a deterministic next-step directive for Bland, while Bland remains responsible for conversational phrasing and pathway flow.

The canonical real-flow target is material request creation from a Bland Pathway or Custom Tool node. Other actions remain as secondary enterprise workflow examples.

The main proof will be operational trace quality: a reviewer can inspect one action and see the call context, tenant config, caller identity, policy checks, lifecycle transitions, adapter attempts, idempotency behavior, downstream result, and follow-up response.

## Architecture Decisions

Use the existing Next.js app and Drizzle/Postgres stack. Keep memory mode for fast local demos and tests, but make Postgres the authoritative persistence-backed proof path.

Add customer configuration as first-class seed data and policy input. Keep it typed and small. Do not introduce a rules DSL.

Add lifecycle state as explicit data, not just inferred from `policyDecision` and `outcome`.

Add adapter attempts and action request records. Mutations will be claimed through persisted idempotency records before calling the adapter.

Keep action contracts close to `lib/schemas/actions.ts`, with per-action schema, idempotency semantics, and response fields documented in code and docs.

## Integration Decisions

The public webhook remains `POST /api/bland/webhook`.

Preferred Bland setup:

- Pathway extracts `site_name`, `material_name`, `quantity`, `needed_by`, and optional `bypass_attempt`.
- Pathway passes built-in `{{call_id}}`, `{{from}}`, `{{lastUserMessage}}`, and configured `customer_key`/`deployment_id` request data to VoiceLab.
- VoiceLab returns compact JSON fields Bland can map into response variables: `status`, `speak`, `interaction_id`, `action_id`, `guardrails`, and `required_clarifications`.
- VoiceLab also returns `next_step.directive`, `next_step.reason_code`, required fields, safe context, action/approval ids, and retry/reconciliation flags. Bland can map these fields via response data and route on the directive.
- Bland routes on `next_step.directive` or compatibility `status`, not internal VoiceLab implementation details.

Webhook authentication:

- For local/demo mode, missing `BLAND_WEBHOOK_SECRET` allows requests for easy testing.
- For external Bland testing, require `BLAND_WEBHOOK_SECRET`; the verified Console Webhook-node path used the raw `x-bland-webhook-secret` header, which is the only mechanism the endpoint accepts.

## State Machine Decision

Use the lifecycle states from `docs/PRD_V2.md`:

`received -> validated -> clarification_required | human_review_required | blocked | approval_pending | executing -> succeeded | reconciliation_required | failed_retryable | failed_terminal | recovered`

Approvals add:

`approval_pending -> approved -> executing -> succeeded`

or:

`approval_pending -> rejected`

Duplicate/retry handling is represented through replay/recovery flags on the action request or adapter attempt. Unknown downstream outcome is explicit `reconciliation_required`; confirmed no-mutation failures are `failed_retryable`.

## Idempotency Decision

The idempotency key is mandatory for mutations. It should be derived by the caller integration as:

`<source>:<call_id>:<action>:<normalized_fingerprint>`

For existing compatibility, the webhook may continue using `call_id` alone while the gateway stores a normalized action fingerprint. V2 tests cover identical delivery, duplicate webhook behavior, known-success replay, unknown-outcome reconciliation, and safe retry after confirmed no mutation.

Postgres idempotency must be backed by persisted uniqueness. Memory mode can mirror behavior for tests, but cannot be the headline proof.

## Approval Decision

Over-budget material requests create `approval_pending`. The approval stores the normalized payload/fingerprint needed for later execution. Approve/reject endpoints must be explicit, logged, and idempotent. Approving the same request twice returns the existing result.

For V2, "authorized operator" can be a seeded operator identity checked in the request. This is enough to prove the state transition without building login.

## Failure Injection Decision

Failure injection lives behind the mock ERP adapter and is selected by seeded scenario or explicit test metadata. It must not contaminate normal demo paths.

Trace data should label adapter failures as simulated and classify them as retryable before mutation, unknown-after-mutation requiring reconciliation, or terminal.

## Screenshot Decision

Use Playwright for screenshot capture. Add `npm run screenshots` and produce a curated set under `docs/screenshots/*.png`:

- successful action trace
- approval or blocked policy trace
- retry/failure recovery trace
- layered deployment evidence

Delete Markdown screenshot placeholders once PNG generation exists.

## Credential Decisions

Ask for `BLAND_API_KEY` only when the local integration harness and docs are ready to run against Bland.

Never commit credentials. Store live evidence in a sanitized report with timestamps, pathway/test ids where safe, result status, and limitations.

Documentation may say "verified against a real Bland Webhook node with authenticated execution and Neon-backed persistence." It must not claim full live phone deployment, full Agent Testing coverage, or production readiness.
