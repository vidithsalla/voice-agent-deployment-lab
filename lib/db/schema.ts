import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull()
});

export const roles = pgTable("roles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  name: text("name").notNull()
});

export const users = pgTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  roleId: varchar("role_id", { length: 64 }).notNull(),
  name: text("name").notNull(),
  title: text("title").notNull()
});

export const sites = pgTable("sites", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  name: text("name").notNull(),
  managerUserId: varchar("manager_user_id", { length: 64 }).notNull()
});

export const phoneIdentities = pgTable("phone_identities", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  phoneNumber: text("phone_number").notNull(),
  label: text("label").notNull()
});

export const userSiteAccess = pgTable("user_site_access", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  siteId: varchar("site_id", { length: 64 }).notNull()
});

export const materials = pgTable("materials", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull()
});

export const vendors = pgTable("vendors", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  name: text("name").notNull()
});

export const siteStock = pgTable("site_stock", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  siteId: varchar("site_id", { length: 64 }).notNull(),
  materialId: varchar("material_id", { length: 64 }).notNull(),
  availableQuantity: integer("available_quantity").notNull()
});

export const budgets = pgTable("budgets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  siteId: varchar("site_id", { length: 64 }).notNull(),
  monthlyLimit: numeric("monthly_limit", { precision: 12, scale: 2 }).notNull(),
  committedAmount: numeric("committed_amount", { precision: 12, scale: 2 }).notNull()
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  siteId: varchar("site_id", { length: 64 }).notNull(),
  vendorId: varchar("vendor_id", { length: 64 }).notNull(),
  code: text("code").notNull(),
  status: text("status").notNull(),
  expectedDeliveryDate: text("expected_delivery_date").notNull(),
  nextStep: text("next_step").notNull()
});

export const vendorInvoices = pgTable("vendor_invoices", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  vendorId: varchar("vendor_id", { length: 64 }).notNull(),
  paymentStatus: text("payment_status").notNull(),
  invoiceCode: text("invoice_code").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull()
});

export const requisitions = pgTable("requisitions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  siteId: varchar("site_id", { length: 64 }).notNull(),
  requestedByUserId: varchar("requested_by_user_id", { length: 64 }).notNull(),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  interactionId: varchar("interaction_id", { length: 64 }).notNull(),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
  neededBy: text("needed_by").notNull()
});

export const requisitionLines = pgTable("requisition_lines", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  requisitionId: varchar("requisition_id", { length: 64 }).notNull(),
  materialId: varchar("material_id", { length: 64 }).notNull(),
  quantity: integer("quantity").notNull()
});

export const approvalRequests = pgTable("approval_requests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  siteId: varchar("site_id", { length: 64 }).notNull(),
  requestedByUserId: varchar("requested_by_user_id", { length: 64 }).notNull(),
  interactionId: varchar("interaction_id", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull()
});

export const siteIssues = pgTable("site_issues", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  siteId: varchar("site_id", { length: 64 }).notNull(),
  reportedByUserId: varchar("reported_by_user_id", { length: 64 }).notNull(),
  interactionId: varchar("interaction_id", { length: 64 }).notNull(),
  severity: text("severity").notNull(),
  summary: text("summary").notNull(),
  idempotencyKey: text("idempotency_key").notNull()
});

export const voiceInteractions = pgTable("voice_interactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  siteId: varchar("site_id", { length: 64 }),
  callerPhone: text("caller_phone").notNull(),
  callerId: varchar("caller_id", { length: 64 }),
  transcript: text("transcript").notNull(),
  intent: text("intent").notNull(),
  extractedFields: jsonb("extracted_fields").notNull(),
  actionAttempted: text("action_attempted").notNull(),
  policyDecision: text("policy_decision").notNull(),
  outcome: text("outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const voiceActionLogs = pgTable("voice_action_logs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  interactionId: varchar("interaction_id", { length: 64 }).notNull(),
  actionName: text("action_name").notNull(),
  requestPayload: jsonb("request_payload").notNull(),
  responsePayload: jsonb("response_payload").notNull(),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  interactionId: varchar("interaction_id", { length: 64 }).notNull(),
  actionName: text("action_name").notNull(),
  requestBody: jsonb("request_body").notNull(),
  responseBody: jsonb("response_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const guardrailEvents = pgTable("guardrail_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  interactionId: varchar("interaction_id", { length: 64 }).notNull(),
  code: text("code").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const messageFollowups = pgTable("message_followups", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orgId: varchar("org_id", { length: 64 }).notNull(),
  interactionId: varchar("interaction_id", { length: 64 }).notNull(),
  channel: text("channel").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const evalRuns = pgTable("eval_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  failCount: integer("fail_count").notNull(),
  intentAccuracy: numeric("intent_accuracy", { precision: 5, scale: 2 }).notNull(),
  fieldExtractionAccuracy: numeric("field_extraction_accuracy", { precision: 5, scale: 2 }).notNull(),
  actionAccuracy: numeric("action_accuracy", { precision: 5, scale: 2 }).notNull(),
  guardrailAccuracy: numeric("guardrail_accuracy", { precision: 5, scale: 2 }).notNull(),
  unsafeActionRate: numeric("unsafe_action_rate", { precision: 5, scale: 2 }).notNull(),
  unsafeActionCount: integer("unsafe_action_count").notNull(),
  clarificationAccuracy: numeric("clarification_accuracy", { precision: 5, scale: 2 }).notNull(),
  auditCoverage: numeric("audit_coverage", { precision: 5, scale: 2 }).notNull(),
  policyBypassDefenseRate: numeric("policy_bypass_defense_rate", { precision: 5, scale: 2 }).notNull(),
  financePrivacyPassRate: numeric("finance_privacy_pass_rate", { precision: 5, scale: 2 }).notNull(),
  duplicatePreventionPassRate: numeric("duplicate_prevention_pass_rate", { precision: 5, scale: 2 }).notNull(),
  createdRequisitionsCount: integer("created_requisitions_count").notNull(),
  createdApprovalsCount: integer("created_approvals_count").notNull(),
  createdEscalationsCount: integer("created_escalations_count").notNull(),
  missingAuditLogCount: integer("missing_audit_log_count").notNull(),
  readinessStatus: text("readiness_status").notNull()
});

export const evalResults = pgTable("eval_results", {
  id: varchar("id", { length: 64 }).primaryKey(),
  evalRunId: varchar("eval_run_id", { length: 64 }).notNull(),
  scenarioId: text("scenario_id").notNull(),
  passed: boolean("passed").notNull(),
  notes: jsonb("notes").notNull()
});
