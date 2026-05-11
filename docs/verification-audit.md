# Verification Audit

## Current Architecture Summary

The shared orchestration entrypoint is [lib/actions/action-gateway.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/action-gateway.ts). It now runs the full loop:

`transcript -> extraction -> caller -> policy -> action -> audit -> eval`

Extraction is handled by [lib/extraction](/Users/vidithreddy/voice-agent-deployment-lab/lib/extraction):

- deterministic
- optional LLM
- Bland variables

The repository layer is [lib/db/repository.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/db/repository.ts), which uses Drizzle/Postgres when `DATABASE_URL` is set and the seeded in-memory fallback otherwise.

## Shared Execution Path

Yes. The main surfaces share the same execution path:

- simulator/API demo: [app/api/demo/run-scenario/route.ts](/Users/vidithreddy/voice-agent-deployment-lab/app/api/demo/run-scenario/route.ts) -> `runVoiceAction`
- Bland webhook: [app/api/bland/webhook/route.ts](/Users/vidithreddy/voice-agent-deployment-lab/app/api/bland/webhook/route.ts) -> [lib/bland/adapter.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/bland/adapter.ts) -> `runVoiceAction`
- trace verification: [scripts/verify-trace.ts](/Users/vidithreddy/voice-agent-deployment-lab/scripts/verify-trace.ts) -> [lib/verification/scenario-runner.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/verification/scenario-runner.ts) -> `runVoiceAction`
- evals: [scripts/eval.ts](/Users/vidithreddy/voice-agent-deployment-lab/scripts/eval.ts) -> [lib/eval/runner.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/eval/runner.ts) -> `runScenarioGroup` -> `runVoiceAction`

## Policy Engine Files

- [lib/policies/engine.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/policies/engine.ts)
- [lib/policies/rules.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/policies/rules.ts)
- [lib/policies/types.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/policies/types.ts)

The policy engine remains data-driven and is the source of truth for authorization.

## Action Service Files

- [lib/actions/action-gateway.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/action-gateway.ts)
- [lib/actions/requisitions.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/requisitions.ts)
- [lib/actions/approvals.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/approvals.ts)
- [lib/actions/stock.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/stock.ts)
- [lib/actions/purchaseOrders.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/purchaseOrders.ts)
- [lib/actions/vendorPayments.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/vendorPayments.ts)
- [lib/actions/escalations.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/escalations.ts)
- [lib/actions/followups.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/followups.ts)
- [lib/actions/audit.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/actions/audit.ts)

## Where Audit Logs Are Written

Inside `runVoiceAction` and its write-side sub-actions:

- interaction record
- action log
- webhook event
- guardrail event
- follow-up record
- sub-action logs for requisitions, approvals, escalations, and follow-up persistence

## Scenario Sources

- eval scenarios: [eval/scenarios](/Users/vidithreddy/voice-agent-deployment-lab/eval/scenarios)
- simulator scenarios: [lib/simulator/scenarios.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/simulator/scenarios.ts)
- trace verification scenarios: [lib/verification/scenarios.ts](/Users/vidithreddy/voice-agent-deployment-lab/lib/verification/scenarios.ts)
- pathway handoff configs: [pathways](/Users/vidithreddy/voice-agent-deployment-lab/pathways)

## Real Data Surfaces

- simulator: [components/scenario-runner.tsx](/Users/vidithreddy/voice-agent-deployment-lab/components/scenario-runner.tsx)
- dashboard: [app/dashboard/page.tsx](/Users/vidithreddy/voice-agent-deployment-lab/app/dashboard/page.tsx)
- call detail: [app/calls/[id]/page.tsx](/Users/vidithreddy/voice-agent-deployment-lab/app/calls/[id]/page.tsx)
- approvals: [app/approvals/page.tsx](/Users/vidithreddy/voice-agent-deployment-lab/app/approvals/page.tsx)
- evals: [app/evals/page.tsx](/Users/vidithreddy/voice-agent-deployment-lab/app/evals/page.tsx)

These pages read repository-backed data rather than placeholder arrays.

## Disconnected Or Limited Parts

- LLM extraction exists but was not exercised here because `OPENAI_API_KEY` is not configured.
- Postgres verification support exists but was skipped here because `DATABASE_URL` is not configured.
- Bland compatibility is implemented at webhook level, not as a full telephony deployment.

## Exact Changes Made In This Perfection Pass

- added dual-mode extraction abstraction plus Bland variable normalization
- added safe-fail extraction handling with `extraction_failed`
- added `POST /api/bland/webhook` with optional webhook secret verification
- added pathway-as-code configs under [pathways](/Users/vidithreddy/voice-agent-deployment-lab/pathways)
- expanded evals from 30 to 50 scenarios
- added richer eval metrics for field extraction, audit coverage, bypass defense, finance privacy, and duplicate prevention
- added `npm run eval:llm`
- added `npm run verify:db`
- added timeline traces to the action response, call detail page, and trace verification report
- added security, demo, outreach, screenshot placeholder, and Bland integration docs
- expanded automated tests from 10 to 18

## Final Perfection Pass Summary

### What Changed

- deterministic-only extraction risk was reduced by introducing optional LLM and Bland-variable extraction modes behind the same policy/action layer
- webhook compatibility moved from a stub adapter to a real `POST /api/bland/webhook` path
- eval coverage increased to 50 scenarios with adversarial and noisy cases
- observability improved through explicit timeline steps on each orchestration run

### Risks Fixed

- extraction is no longer single-mode
- evals now prove more than high-level pass/fail
- Bland integration is now concrete enough to review
- read-only finance visibility is explicitly tested and scored

### Risks That Remain

- LLM extraction is unverified in this environment without `OPENAI_API_KEY`
- Postgres persistence is implemented but unproven here without `DATABASE_URL`
- screenshots are placeholders until captured manually

### Commands Run

- `npm run build` -> pass
- `npm run eval` -> pass
- `npm run verify:trace` -> pass
- `npm test` -> pass
- `npm run db:seed` -> pass
- `npm run verify:db` -> graceful skip because `DATABASE_URL` is not set
- `npm run eval:llm` -> graceful skip because `OPENAI_API_KEY` is not set

### Manual Review Checklist Before Loom

- run one simulator scenario and one blocked scenario in the browser
- open the generated call detail page and confirm the decision timeline is readable
- skim [docs/trace-verification.md](/Users/vidithreddy/voice-agent-deployment-lab/docs/trace-verification.md)
- skim [docs/deployment-readiness-report.md](/Users/vidithreddy/voice-agent-deployment-lab/docs/deployment-readiness-report.md)
- decide whether to present deterministic extraction first and mention optional LLM mode as a future-facing path
