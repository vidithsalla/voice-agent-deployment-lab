# Bland Integration

## Overview

This project does not try to replace Bland. Bland owns the phone call, pathway flow, variable extraction, pathway versions, and conversation-level testing. VoiceLab owns the deployment gateway around the Bland action boundary: typed webhook handling, caller resolution, tenant policy, approval, idempotency, adapter execution, audit logs, and business-side regression tests.

The main Bland-compatible endpoint is:

- `POST /api/bland/webhook`

## What Bland Owns Vs What This Harness Owns

Bland owns:

- the phone call
- the pathway flow
- speech turn-taking
- variable capture inside the call
- pathway versions and promotion
- Agent Testing scenarios, assertions, batches, and promotion gates
- webhook/tool timeout and retry configuration

This harness owns:

- validating the webhook payload
- resolving caller identity from phone number
- normalizing extracted variables into typed action inputs
- enforcing RBAC, site access, budget, duplicate, and privacy policy
- executing or blocking backend actions
- enforcing idempotency for mutations
- reconciling unknown mutating outcomes before any retry
- writing interaction, action, webhook, guardrail, and follow-up records
- returning a deterministic `next_step` directive Bland can map into variables

## Endpoint

`POST /api/bland/webhook`

Headers:

- `Content-Type: application/json`
- `x-bland-webhook-secret: <BLAND_WEBHOOK_SECRET>`, the header verified from a Bland Console Webhook node. It is the only authentication mechanism the endpoint accepts.

## Expected Payload

Recommended current-style payload:

```json
{
  "call_id": "bland_call_123",
  "from": "+15551230001",
  "lastUserMessage": "This is Raj from Site A. We need 40 bags of cement tomorrow morning.",
  "request_data": {
    "customer_key": "ventra"
  },
  "pathway_id": "pathway_123",
  "pathway_version": 3,
  "node_id": "node_456",
  "variables": {
    "intent": "create_material_request",
    "site_name": "Site A",
    "material_name": "cement",
    "quantity": 40,
    "needed_by": "tomorrow morning"
  }
}
```

Compatibility payload:

```json
{
  "call_id": "bland_call_123",
  "caller_phone": "+15551230001",
  "transcript": "This is Raj from Site A. We need 40 bags of cement tomorrow morning.",
  "variables": {
    "intent": "create_material_request",
    "site_name": "Site A",
    "material_name": "cement",
    "quantity": 40,
    "needed_by": "tomorrow morning"
  },
  "metadata": {
    "pathway_id": "pathway_123",
    "pathway_version": 3,
    "node_id": "node_456"
  }
}
```

## Response Shape

```json
{
  "status": "success",
  "speak": "I created a requisition draft for 40 bags of cement at Site A.",
  "interaction_id": "bland_call_123",
  "action_id": "create_material_request",
  "guardrails": [],
  "required_clarifications": [],
  "next_step": {
    "directive": "continue",
    "reason_code": "COMPLETED",
    "required_fields": [],
    "safe_explanation": "Created requisition req_123.",
    "action_request_id": "action-request-123",
    "approval_request_id": null,
    "operator_intervention_required": false,
    "can_retry": false,
    "can_reconcile": false,
    "context": {}
  }
}
```

Possible `status` values:

- `success`
- `clarification_needed`
- `blocked`
- `approval_required`
- `escalated`
- `reconciliation_required`
- `human_review_required`
- `retryable_failure`
- `failed`

Canonical `next_step.directive` values:

- `continue`: the business process may continue.
- `clarify`: Bland should collect missing required fields.
- `await_approval`: a valid request is waiting for operator approval.
- `handoff_to_human`: automation cannot safely proceed.
- `retry_later`: retry is safe, but should be an explicit later/operator action.
- `reconcile`: a mutating downstream outcome is unknown; do not retry yet.

Recommended Bland response data mappings:

- `$.next_step.directive` -> `voicelab_next_step`
- `$.next_step.reason_code` -> `voicelab_reason_code`
- `$.next_step.required_fields` -> `voicelab_required_fields`
- `$.next_step.action_request_id` -> `voicelab_action_request_id`
- `$.next_step.approval_request_id` -> `voicelab_approval_request_id`
- `$.next_step.can_retry` -> `voicelab_can_retry`
- `$.next_step.can_reconcile` -> `voicelab_can_reconcile`

Bland Pathways can then route on `voicelab_next_step` while Bland still controls the exact spoken words and node flow.

## Pathway Node Mapping

- material request node -> `POST /api/bland/webhook` with `intent=create_material_request`
- stock check node -> `POST /api/bland/webhook` with `intent=check_stock`
- PO status node -> `POST /api/bland/webhook` with `intent=check_po_status`
- vendor payment node -> `POST /api/bland/webhook` with `intent=check_vendor_payment`
- urgent site issue node -> `POST /api/bland/webhook` with `intent=escalate_site_issue`

In Pathways, map tool/webhook fields from extracted variables and system variables. Bland's Pathway mode does not require the agent to invent arbitrary backend parameters; the Pathway should link known variables into the webhook/tool request.

## Variable Handling

Supported variables:

- `intent`
- `site_name`
- `material_name`
- `quantity`
- `needed_by`
- `urgency`
- `po_code`
- `vendor_name`
- `issue_summary`
- `bypass_attempt`

Bland variables are normalized and validated, but they are not trusted for authorization. Fields such as `authorized`, `approval_required`, role hints, or arbitrary upstream safety flags are not part of the trusted action contract. The policy engine still decides whether the caller can do the action.

Recommended Bland variables:

- `{{call_id}}` -> `call_id`
- `{{from}}` -> `from`
- `{{lastUserMessage}}` -> `lastUserMessage`
- `request_data.customer_key` -> customer configuration key
- extracted `site_name`, `material_name`, `quantity`, `needed_by`, and optional `bypass_attempt` -> `variables`

## Simulator Mode Vs Bland Webhook Mode

Simulator mode:

- defaults to deterministic extraction
- runs offline without external APIs
- is the main review path for evals and trace verification

Bland webhook mode:

- accepts call transcript plus pathway variables
- uses `bland_variables` extraction mode
- still runs the exact same `runVoiceAction` policy and action path
- returns compact response fields that Bland can map into response variables and route on

## Bland Agent Testing Split

Use Bland Agent Testing for conversation behavior:

- required variables were collected
- webhook/tool was triggered
- expected node was reached
- caller heard the right confirmation, clarification, approval, or blocked response

Use VoiceLab tests for business-side safety:

- auth and schema validation
- tenant policy
- duplicate delivery
- retry and recovery semantics
- persisted side-effect and audit verification

Verified scope: this repository has been tested against a real Bland Console Webhook node with authenticated execution and Neon-backed persistence. Do not describe it as a full live phone deployment, production customer deployment, or complete Bland Agent Testing pass.

## Environment Variables

```txt
EXTRACTION_MODE=deterministic
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
DATABASE_URL=
BLAND_WEBHOOK_SECRET=
OPERATOR_API_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Security Notes

- If `BLAND_WEBHOOK_SECRET` is configured, requests without a matching secret are rejected.
- The verified Bland UI configuration used `x-bland-webhook-secret`; Bland's built-in Bearer auth control returned `401` in the final UI pass. `Authorization`, `X-Webhook-Signature` and HMAC are not accepted, and the raw header is compared in constant time.
- With no `BLAND_WEBHOOK_SECRET` configured, requests are accepted outside production only and rejected in production.
- `request_data.customer_key` is required and must name a seeded customer configuration. A missing or unknown key returns `handoff_to_human` / `UNKNOWN_CUSTOMER` and takes no action; there is no fallback tenant. The key is a routing hint protected by the shared webhook secret. Per-tenant secrets are not implemented, so anyone holding the secret can address any tenant.
- The webhook ignores `failure_mode`/`failureMode` in the payload; failure injection exists only on the operator-protected demo route.
- The idempotency key is derived from `call_id` plus the normalized action payload. Redelivery of the same request replays; a different request in the same call is a separate action.
- Unknown callers cannot mutate data.
- Non-finance users cannot view vendor payment status.
- Bypass attempts are blocked even if the webhook variables look well formed.
- Unknown write outcomes return `next_step.directive = "reconcile"` and cannot be retried through the safe-retry endpoint until reconciliation proves no mutation occurred.
- Audit logs are still written for blocked and clarification paths.

## What Is Intentionally Not Implemented Yet

- live phone-call deployment and full Agent Testing coverage
- real telephony transfer flows
- external SMS delivery
- customer-specific auth beyond the single shared webhook secret
- production deployment packaging for a specific customer environment
