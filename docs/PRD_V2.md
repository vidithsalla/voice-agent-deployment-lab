# Voice Agent Deployment Lab V2 PRD

## Thesis

Bland owns the conversation. Voice Agent Deployment Lab controls whether that conversation is allowed to become a real side effect in a customer's systems.

V2 is a deployment gateway proof, not a voice-agent platform. The product value is the layer between a Bland Pathway/tool call and customer systems of record: identity, tenant configuration, typed action contracts, policy, approval, idempotency, retries, recovery, audit, and operator intervention.

VoiceLab now returns a deterministic policy-derived next-step directive to Bland. Bland may route or speak based on the directive, but VoiceLab does not generate full conversational dialogue or become a second conversation engine.

## User And Problem

Primary user: an Agent Solutions Engineer or Forward Deployed Engineer deploying a Bland voice agent into an enterprise construction operations environment.

The user needs to prove that extracted voice intent cannot directly mutate ERP or finance systems. Every proposed action must be normalized into a typed backend contract, evaluated against customer policy, executed idempotently, and stored with enough trace data for operators and reviewers to understand what happened.

## Bland Boundary

Bland-owned responsibilities:

- Telephony, speech, conversation state, and pathway routing.
- Pathway variable extraction before webhook or tool invocation.
- Built-in call context such as `call_id`, caller number, callee number, and timestamp variables.
- Pathway versions, staging or production promotion, and conversation-level testing.
- Webhook/tool invocation timing, timeout, retry count, response data mapping, and response-based routing.

VoiceLab-owned responsibilities:

- Webhook payload validation and authentication.
- Customer/tenant resolution from request data, pathway metadata, caller identity, or configured mapping.
- Caller identity and permissions.
- Typed action contracts for supported business actions.
- Policy evaluation independent of extraction.
- Policy-derived next-step directive generation.
- Approval and operator state transitions.
- Idempotency and retry-safe side effects.
- Customer-system adapter behavior and failure recovery.
- Audit trace, deployment evidence, and business-side regression tests.

Official Bland documentation used for this boundary:

- Conversational Pathways: https://docs.bland.ai/tutorials/pathways
- Webhooks: https://docs.bland.ai/tutorials/webhooks
- Tools overview: https://docs.bland.ai/tutorials/tools/overview
- Secrets: https://docs.bland.ai/tutorials/secrets
- Webhook Signing: https://docs.bland.ai/tutorials/webhook-signing
- Agent Testing Scenarios: https://docs.bland.ai/tutorials/scenarios
- Pathway API: https://docs.bland.ai/api-v1/post/pathways
- Pathway Chat API: https://docs.bland.ai/api-v1/post/pathway-chat-create

## Scope

V2 must demonstrate one high-quality real integration path and several deterministic business-side safety paths.

Core actions:

- `create_material_request`
- `check_stock`
- `check_po_status`
- `check_vendor_payment`
- `escalate_site_issue`

Core proof paths:

- Successful material request creates exactly one requisition.
- Over-budget material request enters approval state without creating a requisition.
- Approval/rejection is an explicit operator transition.
- Duplicate webhook delivery does not create duplicate business state.
- Retry after known downstream success reuses the original result.
- Downstream timeout, retryable error, lost response, reconciliation result, and terminal validation failure are visible in the trace.
- Tenant rules change behavior without changing the orchestration code.

## Non-Goals

- Rebuilding Bland Pathways, Personas, or Agent Testing.
- Claiming deterministic regression results prove end-to-end voice accuracy.
- Implementing a generic no-code rules DSL.
- Building a production ERP connector.
- Committing Bland credentials, test phone numbers, or real customer data.

## Trust Boundaries

The Bland webhook is trusted only as a signed transport event after verification. Extracted variables remain untrusted input. A valid Bland payload does not confer authorization.

VoiceLab treats the downstream system adapter as an external dependency that can time out, partially fail, or mutate state before the HTTP response is lost. Persistence is the authority for idempotency and recovery in the proof path.

## Major Entities

- Customer/tenant configuration: allowed sites, role policy, action permissions, finance visibility, approval thresholds, failure-injection profile, and optional Bland pathway mappings.
- Caller identity: phone number, org, role, and allowed sites.
- Action request: one normalized intent with typed fields, source call context, idempotency key, lifecycle state, and policy snapshot.
- Approval request: pending, approved, rejected, or expired operator decision linked to the original action.
- Adapter operation: downstream mutation or read attempt with correlation id, attempt number, result, and failure classification.
- Audit event: append-only evidence for validation, policy, approval, execution, retry, duplicate reuse, and operator intervention.

## Action Lifecycle

V2 will use these lifecycle states:

- `received`: webhook or simulator request accepted.
- `validated`: payload schema and required fields are structurally valid.
- `clarification_required`: request cannot be safely evaluated or executed because fields are missing or invalid.
- `human_review_required`: automation cannot safely proceed, usually because clarification or reconciliation could not resolve the state.
- `blocked`: policy denies the action.
- `approval_pending`: policy allows only after operator approval.
- `approved`: an authorized operator approved execution.
- `rejected`: an authorized operator rejected execution.
- `executing`: adapter execution is in progress or claimed by an idempotency record.
- `succeeded`: downstream side effect completed or a prior success was safely replayed.
- `reconciliation_required`: a mutating downstream request may have changed state, but VoiceLab did not receive a reliable outcome.
- `failed_retryable`: retry is safe because no downstream mutation occurred or reconciliation proved none occurred.
- `failed_terminal`: adapter rejected the operation permanently.
- `recovered`: a retry or operator recovery resolved a prior retryable/unknown state.

The UI and audit trace must not collapse "the model proposed an action" and "the business mutation completed" into one boolean.

## Idempotency Strategy

Every mutation has a stable idempotency key derived from Bland `call_id` plus action name and normalized action fingerprint, or an explicit request idempotency key in simulator/test mode.

The persistence-backed path must enforce uniqueness in storage rather than relying on an in-memory set. For Postgres, this means unique indexes or transactional claim rows around action requests and downstream operations. If a duplicate arrives after success, the gateway returns a replay response linked to the original record. If a duplicate arrives while execution is unknown, the gateway returns `reconciliation_required` without issuing a second mutation.

## Approval Model

Over-threshold requests create an approval request linked to the original action request. Approval is not a badge; it is a state transition performed by an authorized operator. Approval execution must reuse the original idempotency record and must not create a second action if the approval endpoint is called repeatedly.

Approval expiry and policy-version revalidation are not implemented yet. The current proof covers explicit approve/reject transitions, idempotent approval execution, and rejection blocking later execution.

## Tenant Configuration

V2 will seed at least two realistic customer configurations:

- Ventra Build Group: broader site-manager material request permissions, lower approval friction for Site A, finance data restricted to finance.
- Northstar Civil Works: stricter material limits, procurement-only creation for some materials or sites, different escalation behavior, and finance visibility disabled for field roles.

The goal is not a generic rule language. The goal is to show that one gateway can adapt to customer policy through configuration.

## Failure Model

The mock ERP adapter will support deterministic failure modes:

- `none`: normal success.
- `timeout_before_mutation`: no mutation happened, retry is safe.
- `retryable_5xx`: no known success, retry is safe.
- `mutated_response_lost`: the mutating request may have succeeded but VoiceLab lacks a reliable response; the action enters reconciliation before retry.
- `terminal_validation_failure`: downstream rejected the operation; retrying the same payload should not mutate state.

All simulated failures must be clearly labeled as simulated.

## Testing Layers

Layer 1, Bland conversation tests: use Bland Agent Testing scenarios when credentials and a public webhook URL are available. Assertions should cover required variables, webhook/tool invocation, node traversal, and caller-facing response.

Layer 2, VoiceLab policy regression: deterministic suite for business correctness. This is not an extraction-accuracy or voice-quality claim.

Layer 3, HTTP/integration contract tests: Bland webhook authentication, schema validation, malformed variables, duplicate delivery, retry semantics, timeout/error responses, and response mapping.

Layer 4, persistence/recovery verification: Postgres-backed idempotency and recovery tests that survive process restart.

Layer 5, optional LLM extraction evidence: separate noisy-transcript extraction evaluation, never mixed into deterministic pass rates.

## Demo Strategy

The demo should start with the deployment boundary, not a simulator dashboard.

Required screens:

- Integration status and current evidence.
- Recent calls/action requests.
- Strong call/action trace detail.
- Approval queue with approve/reject actions.
- Failure/recovery view.
- Customer configuration comparison.
- Layered test evidence.

Screenshots are generated PNGs from seeded state using browser automation. Placeholder Markdown screenshots are removed.

## Evidence Claims

Supported without Bland credentials:

- Gateway validates Bland-shaped webhook payloads.
- Policy prevents unauthorized or unsafe actions.
- Deterministic duplicate and retry tests do not duplicate local business state.
- Simulated downstream failures produce recoverable trace states.
- Persistence-backed mode enforces idempotency when configured and verified.

Credential-dependent or externally scoped:

- Full live phone deployment.
- Real Bland Agent Testing scenario runs across every directive.
- Pathway promotion gates.

Completed external proof is limited to a real Bland Console Webhook-node request into VoiceLab with authenticated execution and Neon-backed persistence. The repository must not present that as full live telephony or production readiness.
