# Trace Verification

This report verifies the shared loop:

`transcript -> extraction -> caller -> policy -> action -> audit log -> eval assertion`

## Valid material request

- Scenario id: valid_material_request
- Description: Known site manager creates an allowed requisition with full trace.
- Passed: yes

### Run 1: valid-material-request-run

- Transcript: This is Raj from Site A. We need 40 bags of cement tomorrow morning. Use the usual vendor.
- Caller phone: +15550000001
- Extracted intent: create_material_request
- Extraction mode/source: deterministic / deterministic
- Extracted fields: `{"siteName":"Site A","materialName":"cement","quantity":40,"neededBy":"2026-05-09"}`
- Resolved caller: `{"userId":"user-raj","name":"Raj Patel","orgId":"org-ventra","siteIds":["site-a"],"role":"site_manager","known":true}`
- Policy decision: allow / allowed
- Policy reasons: Policy checks passed.
- Guardrail flags: none
- Action attempted: create_material_request
- Final outcome: Created requisition req-c6278d4b-b313-4aff-8422-6126edf0a005 for 40 cement.
- Created record ids: requisitions=req-c6278d4b-b313-4aff-8422-6126edf0a005, approvals=none, escalations=none, followup=followup-72c01ecc-485b-41cb-a026-20267efc6b48
- Audit log ids/count: action-log-2ae52437-9a86-49ae-ab60-9d5f10205c5e, action-log-f6758737-31bc-4dae-ae37-7477f4929ada, action-log-fc3da134-f81e-4371-a15e-8c4e5a2b9fde / 3
- Webhook event ids/count: webhook-3844dc7a-a457-4326-815a-533dd8ee32bf, webhook-3a576b67-3a3e-45de-88ff-e543908ea165, webhook-e27aad64-8a73-40b9-b752-effacee37342 / 3
- Guardrail event ids/count: none / 0
- Eval pass/fail: pass
- Failure reason: none

#### Timeline

- transcript_received: completed at 2026-05-11T17:40:41.605Z (0ms) | input=+15550000001 | output=This is Raj from Site A. We need 40 bags of cement tomorrow morning. Use the usual vendor. | guardrails=none | reasons=none
- extraction_completed: completed at 2026-05-11T17:40:41.605Z (0ms) | input=deterministic | output=create_material_request {"siteName":"Site A","materialName":"cement","quantity":40,"neededBy":"2026-05-09"} | guardrails=none | reasons=none
- caller_resolved: completed at 2026-05-11T17:40:41.605Z (0ms) | input=+15550000001 | output=Raj Patel (site_manager) | guardrails=none | reasons=none
- policy_evaluated: completed at 2026-05-11T17:40:41.605Z (0ms) | input=create_material_request for Raj Patel | output=allow / allowed | guardrails=none | reasons=Policy checks passed.
- action_attempted: completed at 2026-05-11T17:40:41.605Z (0ms) | input=create_material_request | output=Created requisition req-c6278d4b-b313-4aff-8422-6126edf0a005 for 40 cement. | guardrails=none | reasons=Policy checks passed.
- audit_log_written: completed at 2026-05-11T17:40:41.605Z (0ms) | input=create_material_request | output=interaction, action log, and webhook event stored | guardrails=none | reasons=none
- followup_generated: completed at 2026-05-11T17:40:41.605Z (0ms) | input=allowed | output=Raj Patel, your voice request was completed: Created requisition req-c6278d4b-b313-4aff-8422-6126edf0a005 for 40 cement. | guardrails=none | reasons=none

