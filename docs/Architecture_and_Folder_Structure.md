# Architecture and Folder Structure

## Final concept

**Voice Agent Deployment Lab**

A production-style implementation harness for deploying enterprise voice agents into real business workflows.

## Core loop

```txt
transcript → intent/fields → caller → policy → action → audit → eval
```

Everything in the project should support this loop.

## Suggested folder structure

```txt
voice-agent-deployment-lab/
  app/
    page.tsx
    simulator/
      page.tsx
    dashboard/
      page.tsx
    calls/[id]/
      page.tsx
    approvals/
      page.tsx
    evals/
      page.tsx
    api/
      actions/
        resolve-caller/route.ts
        extract-intent/route.ts
        check-stock/route.ts
        check-budget/route.ts
        create-requisition/route.ts
        request-approval/route.ts
        check-po-status/route.ts
        check-vendor-payment/route.ts
        escalate-site-issue/route.ts
        send-followup/route.ts
      demo/
        run-scenario/route.ts

  lib/
    actions/
      caller.ts
      stock.ts
      budget.ts
      requisitions.ts
      approvals.ts
      purchaseOrders.ts
      vendorPayments.ts
      escalations.ts
      followups.ts
    policies/
      engine.ts
      rules.ts
      types.ts
    schemas/
      voice.ts
      actions.ts
      evals.ts
    db/
      schema.ts
      seed.ts
      queries.ts
    eval/
      runner.ts
      scoring.ts
      report.ts
    simulator/
      extraction.ts
      scenarios.ts

  eval/
    scenarios/
      material-request-valid.json
      material-request-over-budget.json
      unauthorized-payment-request.json
      duplicate-request.json
      urgent-site-issue.json

  docs/
    architecture.md
    eval-results.md
    deployment-readiness-report.md
    demo-script.md

  README.md
  .env.example
```

## Build priority

### Milestone 1: Can this safely take one action?

Build:

- Seed data
- Caller resolution
- Material request workflow
- Budget check
- Requisition or approval creation
- Audit log
- One simulator scenario

Once that works, expand.

## Architecture principles

### 1. Core logic first

The UI should not fake behavior. Build reusable service functions first, then call them from both API routes and the eval harness.

### 2. Simulator and real integration should share the same backend logic

Simulator mode should be reliable and reviewable without external APIs. Bland mode should be optional and environment-gated.

### 3. The policy engine owns permissions

The LLM or extractor can suggest intent and fields. It cannot decide whether to mutate business state.

### 4. Writes must be idempotent

Every create/update action should require an idempotency key and should not duplicate results if a call is retried.

### 5. Audit logs are first-class

Each action should produce an action log, webhook event log, and guardrail event where relevant.

### 6. Evals prove deployment readiness

The eval harness should run without external APIs and produce markdown reports that a reviewer can read quickly.
