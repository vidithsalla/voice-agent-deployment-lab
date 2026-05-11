# Voice Agent Deployment Lab

Production-style harness for deploying enterprise voice agents into real business workflows safely.

## Why This Exists

Voice agents are easy to demo and hard to deploy safely. The hard part is not getting a model to talk. The hard part is turning a call into a typed backend action only after identity, permissions, policy, budget, duplication, and audit checks pass.

This project focuses on that deployment layer.

## What This Is Not

- not a voice model
- not a telephony platform
- not a Bland replacement
- not a production deployment claim

This project does not try to build a voice model or replace Bland. It focuses on the layer around a voice agent that enterprise deployments need: typed actions, policy enforcement, audit logs, and regression testing.

## Core Deployment Loop

```txt
transcript -> extraction -> caller -> policy -> action -> audit -> eval
```

That loop is shared across:

- simulator runs
- `POST /api/demo/run-scenario`
- `POST /api/bland/webhook`
- `npm run eval`
- `npm run verify:trace`

## Architecture

- `lib/actions/action-gateway.ts`: shared orchestration entrypoint
- `lib/extraction/*`: deterministic, optional LLM, and Bland-variable extraction modes
- `lib/policies/*`: data-driven policy engine and RBAC checks
- `lib/actions/*`: typed backend service layer
- `lib/db/repository.ts`: repository abstraction with Postgres or in-memory fallback
- `app/*`: simulator, dashboard, call detail, approvals, and eval UI
- `eval/scenarios/*`: regression suite
- `pathways/*`: pathway-as-code handoff configs

## Demo Workflows

- valid material request creates a requisition
- missing required field returns clarification
- over-budget request routes to approval
- unknown caller cannot mutate data
- duplicate request does not create duplicate state
- non-finance caller cannot view vendor payment data
- finance-authorized caller can view vendor payment data
- PO status lookup stays read-only
- urgent site issue creates an escalation
- approval bypass attempt is blocked and logged

## Extraction Modes

### `deterministic`

- default mode
- used by evals and trace verification
- stable and reproducible
- no external APIs

### `llm`

- optional mode
- enabled only when `OPENAI_API_KEY` is set
- returns the same typed schema as deterministic extraction
- fails closed into clarification rather than unsafe action

### `bland_variables`

- used by `POST /api/bland/webhook`
- validates and normalizes pathway variables
- still relies on the policy engine for authorization

## Bland Webhook Compatibility

The project includes a Bland-style ingestion endpoint:

- `POST /api/bland/webhook`

It accepts transcript plus extracted variables, normalizes them into the shared extraction schema, and then calls the same `runVoiceAction` path used by simulator and evals.

See [docs/Bland-integration.md](/Users/vidithreddy/voice-agent-deployment-lab/docs/Bland-integration.md).

## Pathway-As-Code

The `pathways/` directory contains handoff-style configs for:

- material request
- stock check
- PO status
- vendor payment
- site issue escalation

These are not auto-imports. They are artifacts that show how a deployment engineer could define the pathway contract next to the action gateway.

## Policy Engine And Guardrails

The policy engine is data-driven, not scenario-driven.

Checks include:

- caller known
- site access allowed
- role can create requisition
- role can view finance
- required fields present
- budget within limit
- duplicate request check
- approval bypass attempt
- emergency escalation
- read-only access allowed
- authorized caller required for mutation

Guardrails include:

- `unknown_caller`
- `site_access_denied`
- `missing_required_fields`
- `budget_exceeded`
- `restricted_finance_access`
- `duplicate_request`
- `approval_bypass_attempt`
- `emergency_escalation`
- `extraction_failed`

## Action Gateway

`runVoiceAction` is the center of the system.

It:

1. accepts transcript or normalized variables
2. extracts intent and fields
3. resolves caller from phone number
4. evaluates policy
5. executes, blocks, clarifies, routes, or escalates
6. writes audit and webhook trace records
7. stores follow-up text
8. returns a typed response with a decision timeline

## Auditability And Observability

Every orchestration run records:

- interaction record
- action log
- webhook event
- guardrail events when triggered
- follow-up record

Write-side sub-actions also record their own trace rows.

The call detail page and trace report expose a full timeline:

- transcript received
- extraction completed
- caller resolved
- policy evaluated
- action attempted
- audit log written
- follow-up generated

## Eval Harness

`npm run eval` runs 50 scenarios through the shared action gateway and writes:

- [docs/eval-results.md](/Users/vidithreddy/voice-agent-deployment-lab/docs/eval-results.md)
- [docs/deployment-readiness-report.md](/Users/vidithreddy/voice-agent-deployment-lab/docs/deployment-readiness-report.md)

Current proof lines:

- `npm run eval`
- `npm run verify:trace`
- `npm test`
- eval scenario count: `50`
- unsafe action count: `0`
- audit coverage: `100%`
- readiness status: `ready`

## Deployment Readiness Report

Readiness is `ready` only if:

- unsafe action count is `0`
- critical scenarios pass
- audit coverage is `100%`

It becomes `conditionally_ready` when non-critical failures remain, and `not_ready` if unsafe mutations or audit gaps appear.

## Screenshots

Screenshot placeholders live in [docs/screenshots](/Users/vidithreddy/voice-agent-deployment-lab/docs/screenshots):

- simulator
- call detail
- policy trace
- approvals
- eval results

## Running Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Postgres is optional:

```bash
npm run db:push
npm run db:seed
```

If `DATABASE_URL` is not set, the app uses the seeded in-memory repository so simulator, eval, trace verification, and tests still run.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run eval
npm run eval:llm
npm run verify:trace
npm run verify:db
npm test
npm run db:seed
```

## Environment Variables

```txt
EXTRACTION_MODE=deterministic
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
DATABASE_URL=
BLAND_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENABLE_BLAND_INTEGRATION=false
```

## 90-Second Demo Script

1. Say this is not a voice bot demo, it is the deployment harness around a voice agent.
2. Show the simulator and run the valid material request.
3. Show extraction, caller resolution, policy, created requisition, and timeline.
4. Run a bypass or over-budget case and show safe blocking or approval routing.
5. Open call detail and point to audit logs, webhook trace, and guardrails.
6. End on the eval page and readiness report.

More detailed walkthrough notes are in [docs/demo-script.md](/Users/vidithreddy/voice-agent-deployment-lab/docs/demo-script.md).

## Security And Safety Notes

See [docs/security-and-safety.md](/Users/vidithreddy/voice-agent-deployment-lab/docs/security-and-safety.md).

The short version:

- extraction does not authorize actions
- Bland variables are validated but not trusted for permissions
- unknown callers cannot mutate state
- finance access is role-gated
- over-budget actions route to approval
- duplicate actions are blocked
- all write actions are idempotent

## Known Limitations

- deterministic extraction is still the default review path
- optional LLM extraction is supported but may not be exercised locally without an API key
- Bland compatibility is webhook-level, not a full telecom deployment
- follow-ups are stored as records, not sent through a live messaging provider
- Postgres proof mode depends on `DATABASE_URL`

## Next Steps

- add real screenshots or a stable screenshot script
- run LLM extraction eval in an environment with `OPENAI_API_KEY`
- verify Postgres mode in a live configured environment
- add customer-specific tenant config around the pathway contracts
