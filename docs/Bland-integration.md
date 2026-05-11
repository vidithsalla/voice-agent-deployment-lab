# Bland Integration

## Overview

This project does not try to replace Bland. It models the deployment layer around a voice agent: typed webhook handling, caller resolution, policy enforcement, action execution, audit logs, and evals.

The main Bland-compatible endpoint is:

- `POST /api/bland/webhook`

## What Bland Owns Vs What This Harness Owns

Bland owns:

- the phone call
- the pathway flow
- speech turn-taking
- variable capture inside the call

This harness owns:

- validating the webhook payload
- resolving caller identity from phone number
- normalizing extracted variables into typed action inputs
- enforcing RBAC, site access, budget, duplicate, and privacy policy
- executing or blocking backend actions
- writing interaction, action, webhook, guardrail, and follow-up records

## Endpoint

`POST /api/bland/webhook`

Headers:

- `Content-Type: application/json`
- `x-bland-webhook-secret: <secret>` if `BLAND_WEBHOOK_SECRET` is configured

## Expected Payload

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
  "required_clarifications": []
}
```

Possible `status` values:

- `success`
- `clarification_needed`
- `blocked`
- `approval_required`
- `escalated`

## Pathway Node Mapping

- material request node -> `POST /api/bland/webhook` with `intent=create_material_request`
- stock check node -> `POST /api/bland/webhook` with `intent=check_stock`
- PO status node -> `POST /api/bland/webhook` with `intent=check_po_status`
- vendor payment node -> `POST /api/bland/webhook` with `intent=check_vendor_payment`
- urgent site issue node -> `POST /api/bland/webhook` with `intent=escalate_site_issue`

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

Bland variables are normalized and validated, but they are not trusted for authorization. The policy engine still decides whether the caller can do the action.

## Simulator Mode Vs Bland Webhook Mode

Simulator mode:

- defaults to deterministic extraction
- runs offline without external APIs
- is the main review path for evals and trace verification

Bland webhook mode:

- accepts call transcript plus pathway variables
- uses `bland_variables` extraction mode
- still runs the exact same `runVoiceAction` policy and action path

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

## Security Notes

- If `BLAND_WEBHOOK_SECRET` is configured, requests without a matching secret are rejected.
- Unknown callers cannot mutate data.
- Non-finance users cannot view vendor payment status.
- Bypass attempts are blocked even if the webhook variables look well formed.
- Audit logs are still written for blocked and clarification paths.

## What Is Intentionally Not Implemented Yet

- live outbound Bland pathway provisioning
- real telephony transfer flows
- external SMS delivery
- customer-specific auth beyond shared webhook secret
- production deployment packaging for a specific customer environment
