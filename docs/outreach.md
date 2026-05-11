# Outreach

## LinkedIn DM To Isaiah

Built a small project that focuses on the deployment layer around enterprise voice agents, not the voice model itself. It turns transcripts or Bland-style webhook variables into typed backend actions only after caller resolution, RBAC, budget, duplicate, and audit checks pass. I used a construction ERP demo domain, added evals and trace verification, and kept it runnable offline in simulator mode. If useful, I’d love to send it over.

## Short Follow-Up

Sharing in case it is relevant: this is a deployment harness, not a voice bot demo. The interesting part is the typed action gateway, policy enforcement, audit logs, and evals around a voice workflow.

## Email Variant

Subject: Voice agent deployment harness project

Hi Isaiah,

I built a small project that tries to answer a specific question: what does the layer around a voice agent look like when you need it to touch real business workflows safely?

The project is a simulator-first deployment harness for enterprise voice actions in a construction ERP domain. It runs the loop `transcript -> extraction -> caller -> policy -> action -> audit -> eval`, supports Bland-style webhook payloads, enforces RBAC and approval routing, and includes a 50-scenario eval suite plus trace verification.

It does not try to replace a voice platform or pretend the hard part is ASR. It focuses on the typed backend integration and safety layer after the voice demo.

Happy to send the repo and a short Loom if that would be useful.

## Technical Proof Bullets

- shared action gateway used by simulator, evals, trace verification, and Bland webhook ingestion
- policy engine separated from extraction
- dual extraction modes plus Bland variable normalization
- idempotent write actions
- audit logs for allowed, blocked, routed, and escalated flows
- 50 eval scenarios with unsafe action count 0 and audit coverage 100%

## Honest Caveats

- deterministic extraction is the default review path
- optional LLM extraction is present but not required
- webhook compatibility is implemented, not a full Bland production integration
