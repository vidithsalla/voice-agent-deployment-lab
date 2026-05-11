# Voice Agent Deployment Lab PRD

## Product overview

**Voice Agent Deployment Lab** is a production-style demo showing how an enterprise voice agent can safely connect to backend business workflows.

The app simulates and optionally integrates with a Bland-style voice agent. A caller can make operational requests by phone, such as requesting materials, checking stock, asking about purchase orders, checking vendor payment status, or escalating site issues.

The system resolves the caller, extracts structured intent, validates permissions, runs policy checks, routes unsafe requests to approval, executes safe actions through typed webhooks, logs every decision, and runs regression evals before deployment.

## Goal

Build a serious portfolio artifact that proves ability to:

- Design customer-specific voice agent workflows
- Connect conversational agents to real backend systems
- Enforce permissions and policy before actions
- Build typed webhook/action APIs
- Track audit logs and decision traces
- Test voice agents against realistic failure cases
- Generate deployment readiness reports

## Non-goals

Do not build:

- A Bland competitor
- A custom speech model
- A drag-and-drop workflow builder in v1
- Multi-industry examples
- A generic appointment scheduler
- A purely cosmetic dashboard

## Target user

### Primary user

A forward deployed engineer deploying a voice agent for an enterprise customer.

### Secondary user

An operations/admin user reviewing agent actions, approvals, and call outcomes.

## Demo domain

Construction field operations.

The customer has:

- Organizations
- Sites
- Users
- Phone identities
- Materials
- Site stock
- Budgets
- Vendors
- Purchase orders
- Requisitions
- Approval requests
- Site escalations

## Core workflows

### Workflow 1: Create material request

Example call:

> “This is Raj from Site A. We need 40 bags of cement tomorrow morning.”

Expected behavior:

- Resolve caller
- Confirm site and role
- Extract material, quantity, date, urgency
- Check stock
- Check budget
- Create requisition draft if allowed
- Route to approval if over budget
- Send follow-up summary
- Log full action trace

### Workflow 2: Check stock

Example call:

> “Do we have enough steel rods at Site B?”

Expected behavior:

- Resolve caller
- Check caller’s site access
- Query site stock ledger
- Return available quantity
- Log read-only action

### Workflow 3: Check PO status

Example call:

> “Where is PO-1048?”

Expected behavior:

- Resolve caller
- Check access to PO
- Return PO status, vendor, expected delivery, and next step
- Log read-only action

### Workflow 4: Vendor payment status

Example call:

> “Has Kumar Traders been paid?”

Expected behavior:

- Resolve caller
- Check finance permission
- If authorized, return payment status
- If not authorized, return restricted response
- Never expose sensitive finance info to unauthorized users

### Workflow 5: Urgent site issue

Example call:

> “The generator failed at Site B and work is blocked.”

Expected behavior:

- Resolve caller
- Classify urgent escalation
- Create site issue
- Notify manager/escalation queue
- Send follow-up summary
- Log urgency and escalation path

## Core system components

### A. Voice Agent Simulator

Purpose:

- Let anyone run the demo without needing phone setup.
- Simulate Bland-style transcript and extracted variables.

Features:

- Scenario selector
- Transcript display
- “Run scenario” button
- Shows extracted intent
- Calls backend action gateway
- Displays result

### B. Bland Integration Layer

Purpose:

- Support real Bland webhook integration when API keys are configured.

Features:

- Pathway-style config files
- Webhook endpoint compatibility
- Environment-based enable/disable
- Simulator fallback

### C. Action Gateway

Purpose:

- Central backend layer for all voice-triggered actions.

Endpoints:

```txt
POST /api/actions/resolve-caller
POST /api/actions/extract-intent
POST /api/actions/check-stock
POST /api/actions/check-budget
POST /api/actions/create-requisition
POST /api/actions/request-approval
POST /api/actions/check-po-status
POST /api/actions/check-vendor-payment
POST /api/actions/escalate-site-issue
POST /api/actions/send-followup
POST /api/demo/run-scenario
```

Each endpoint must include:

- Zod request schema
- Zod response schema
- RBAC check where relevant
- Org/site scoping
- Idempotency key for write actions
- Audit log
- Structured error codes
- Deterministic response format

### D. Policy Engine

Purpose:

- Decide whether an action is allowed, blocked, clarified, or routed to approval.

Policies:

- Unknown caller cannot mutate data
- Unauthorized role cannot create sensitive actions
- Missing required fields trigger clarification
- Over-budget requests route to approval
- Duplicate requests are detected
- Finance data is restricted by role
- Urgent issues escalate immediately
- “Bypass approval” attempts are blocked and logged

### E. Audit Log

Purpose:

- Preserve every decision and state change.

Each log should include:

- Interaction ID
- Caller ID
- Org ID
- Site ID
- Transcript
- Intent
- Extracted variables
- Action attempted
- Policy decision
- Webhook request/response
- Before/after state if write action
- Timestamp
- Outcome

### F. Eval Harness

Purpose:

- Test whether the agent deployment is safe before go-live.

Required:

- 30 scenarios minimum for v1
- 50 scenarios target
- JSON scenario files
- `npm run eval`
- Generated `docs/eval-results.md`
- Generated `docs/deployment-readiness-report.md`

Metrics:

- Intent accuracy
- Field extraction correctness
- Action correctness
- Guardrail correctness
- Unsafe action rate
- Clarification handling
- Duplicate prevention
- Approval routing correctness

### G. Dashboard

Purpose:

- Review calls, actions, policy decisions, and outcomes.

Pages:

1. Demo landing page
2. Scenario simulator
3. Call detail page
4. Action trace page
5. Requisitions and approvals page
6. Eval results page

Dashboard should show:

- Transcript
- Extracted fields
- Caller identity
- Intent
- Webhook trace
- Policy decision
- Guardrail flags
- Final outcome
- Follow-up message
- Related requisition/approval/escalation

## Data model

Use Supabase/Postgres or local Postgres. Drizzle preferred.

Core tables:

```txt
organizations
users
sites
phone_identities
roles
user_site_access
materials
vendors
site_stock
budgets
purchase_orders
vendor_invoices
requisitions
requisition_lines
approval_requests
site_issues
voice_interactions
voice_action_logs
webhook_events
guardrail_events
message_followups
eval_runs
eval_scenarios
eval_results
```

Important design rules:

- All records should be org-scoped.
- Write actions should store idempotency keys.
- Audit logs should be append-only.
- Voice interactions should be linked to action logs.
- Approval requests should link back to blocked/held actions.

## Success criteria

The project is successful if:

1. A reviewer can run the app locally.
2. A reviewer can run 5 voice workflow simulations.
3. Every write action goes through policy checks.
4. Unauthorized and over-budget actions are blocked or routed.
5. Eval suite generates a real report.
6. README explains architecture and tradeoffs clearly.
7. Loom shows successful action, blocked unsafe action, and eval report.
8. Outreach message can truthfully say this is a deployment-grade voice agent integration, not a voice bot demo.
