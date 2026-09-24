# Pathway-As-Code

These files are not Bland exports. They are implementation artifacts that show how a forward deployed engineer could hand off pathway intent, required variables, webhook targets, and response templates alongside the deployment harness.

Each file documents:

- target intent
- required variables
- clarification prompts
- webhook endpoint
- success and blocked response templates
- approval or escalation handling

## Webhook requirements

Every webhook node must send the `x-bland-webhook-secret` header (the value of `BLAND_WEBHOOK_SECRET`) and `request_data.customer_key` naming a configured customer (for example `ventra`). A missing or unknown key is handed to a human without any action being taken.
