# Codex Build Guidelines: Voice Agent Deployment Lab

## First Codex prompt

```text
You are building a serious portfolio project called voice-agent-deployment-lab.

This is not a toy chatbot. It is a production-style implementation harness for deploying enterprise voice agents into real business workflows.

Project goal:
Build a Bland-style voice agent deployment lab that connects voice calls to a construction ERP workflow through typed webhooks, RBAC/policy checks, approval routing, audit logs, and regression evals.

Core positioning:
The project should show the layer after the voice demo: how a voice agent safely takes actions inside customer systems.

Tech stack:
- Next.js 15 App Router
- TypeScript
- Tailwind
- Zod
- Supabase/Postgres or local Postgres
- Drizzle ORM preferred
- Optional Bland API integration
- Simulator mode required
- No secrets committed
- Include .env.example

Product domain:
Construction field operations. The customer system is a Ventra-style ERP with:
- organizations
- users
- sites
- phone identities
- materials
- vendors
- stock
- budgets
- purchase orders
- vendor invoices
- requisitions
- approvals
- site issues

Voice workflows:
1. Create material request
2. Check stock
3. Check PO status
4. Check vendor payment status
5. Report urgent site issue

Required pages:
1. Landing page
   - Explain the project in plain language
   - Show architecture summary
   - Buttons for simulator, dashboard, eval results

2. Scenario simulator
   - Dropdown of call scenarios
   - Transcript display
   - Run scenario button
   - Shows extracted intent, variables, action result, policy decision

3. Calls dashboard
   - Recent voice interactions
   - Caller, intent, outcome, timestamp
   - Link to call detail

4. Call detail page
   - Transcript
   - Caller resolution
   - Extracted variables
   - Webhook/action trace
   - Policy decisions
   - Guardrail flags
   - Final result
   - Follow-up message

5. Requisitions/approvals page
   - Created requisitions
   - Approval requests
   - Status and reason

6. Eval results page
   - Latest eval run
   - Pass/fail metrics
   - Failed scenarios
   - Unsafe action count

Backend requirements:
Create typed action endpoints:
- POST /api/actions/resolve-caller
- POST /api/actions/extract-intent
- POST /api/actions/check-stock
- POST /api/actions/check-budget
- POST /api/actions/create-requisition
- POST /api/actions/request-approval
- POST /api/actions/check-po-status
- POST /api/actions/check-vendor-payment
- POST /api/actions/escalate-site-issue
- POST /api/actions/send-followup
- POST /api/demo/run-scenario

Implementation rules:
- Use Zod schemas for all request/response payloads.
- All write actions must require idempotency keys.
- All actions must be org-scoped.
- Users can only act within allowed sites.
- Unknown callers cannot mutate data.
- Missing required fields should return a clarification_needed result.
- Over-budget material requests should create approval requests, not requisitions.
- Unauthorized vendor payment requests should return restricted_access.
- Duplicate material requests should not create duplicate requisitions.
- Urgent site issues should create escalation records.
- Every action should write an audit/action log.
- Store webhook events for each action step.
- Store guardrail events for blocked/routed actions.
- Use deterministic fallback extraction for simulator mode.

Policy engine:
Implement a reusable policy engine with clear rules:
- caller_known
- role_can_create_requisition
- role_can_view_finance
- site_access_allowed
- required_fields_present
- budget_within_limit
- duplicate_request_check
- emergency_escalation
- bypass_attempt_blocked

Eval harness:
Create /eval/scenarios with at least 30 JSON scenarios.
Each scenario should include:
- id
- transcript
- caller_phone
- expected_intent
- expected_fields
- expected_action
- expected_guardrails
- should_create_requisition
- should_create_approval
- should_create_escalation

Create script:
npm run eval

The script should:
- Run all scenarios through the same backend logic or shared service functions.
- Compare actual vs expected.
- Print a pass/fail table.
- Calculate intent accuracy, action accuracy, guardrail accuracy, unsafe action rate.
- Write docs/eval-results.md.
- Write docs/deployment-readiness-report.md.

README requirements:
Write a strong README with:
1. One-line summary
2. Why this exists
3. What the demo shows
4. Architecture diagram using Mermaid
5. Data model overview
6. Action gateway and webhook flow
7. Policy engine
8. Eval harness
9. Demo scenarios
10. Local setup
11. Environment variables
12. 90-second Loom script
13. How this maps to forward deployed voice AI work
14. Known limitations and next steps

Tone:
Clear, technical, realistic. No hype. No inflated claims. Make it read like a serious deployment artifact, not a hackathon project.

Build order:
1. Scaffold app and pages.
2. Define schemas and seed data.
3. Implement policy engine.
4. Implement action services.
5. Implement simulator.
6. Implement dashboard.
7. Implement eval harness.
8. Write README and docs.

Important:
Prefer clean architecture over visual polish. The strongest parts should be the action gateway, policy engine, audit logs, and eval report.
```

## Cursor/Codex operating rules

Use these while building so the repo does not become messy.

### Development rules

1. **One feature per commit**
   - `schema + seed data`
   - `policy engine`
   - `action gateway`
   - `simulator`
   - `eval harness`
   - `dashboard`
   - `docs`

2. **No UI before core logic**
   Build services first. UI should consume real service outputs.

3. **No fake success paths**
   Every action must have failure states.

4. **Do not let the LLM decide authorization**
   LLM/extraction can propose intent. Policy engine decides action.

5. **Keep simulator and real integration separate**
   The simulator should call the same services, but real Bland mode should be optional.

6. **Every write action needs idempotency**
   This is a key enterprise detail.

7. **Every blocked action needs a reason**
   Example:
   - `unknown_caller`
   - `missing_required_fields`
   - `budget_exceeded`
   - `restricted_finance_access`
   - `duplicate_request`
   - `policy_bypass_attempt`

8. **Eval must run without external APIs**
   This makes the repo reviewable.
