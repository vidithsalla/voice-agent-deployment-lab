# Demo Script

## 90-Second Loom

1. Open the landing page and say this is not a voice bot demo. It is the deployment harness around a voice agent.
2. Show the core loop: transcript -> extraction -> caller -> policy -> action -> audit -> eval.
3. Open the simulator and run the valid material request.
4. Show the extraction block, policy checks, created requisition, and timeline.
5. Run the over-budget or bypass scenario and show approval routing or blocking.
6. Open dashboard or call detail and show the trace rows and guardrails.
7. End on the eval page: 50 scenarios, unsafe action count 0, audit coverage 100%.

## 2-Minute Technical Walkthrough

1. Start at `lib/actions/action-gateway.ts`.
2. Explain dual extraction modes: deterministic by default, optional LLM, Bland variables.
3. Explain caller resolution and policy engine separation.
4. Show one write action, one blocked action, and one read-only finance action.
5. Show `docs/trace-verification.md` and `docs/deployment-readiness-report.md`.

## Exact Scenarios To Run

- valid material request
- over-budget material request
- approval bypass attempt
- unauthorized vendor payment

## What To Avoid Over-Explaining

- frontend styling details
- generic Next.js structure
- hypothetical production scale claims

## Honest Caveats To Mention

- deterministic extraction is the default for reviewability
- optional LLM extraction is supported but not required for offline verification
- Bland mode is webhook-compatible, not a full telephony deployment
