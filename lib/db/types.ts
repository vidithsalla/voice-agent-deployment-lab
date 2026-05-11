export type RoleName =
  | "site_manager"
  | "procurement_manager"
  | "finance_analyst"
  | "field_engineer"
  | "guest";

export type IntentType =
  | "create_material_request"
  | "check_stock"
  | "check_po_status"
  | "check_vendor_payment"
  | "escalate_site_issue"
  | "unknown";

export type PolicyDecision = "allowed" | "blocked" | "clarification_needed" | "approval_required";
export type PolicyEngineDecision = "allow" | "block" | "clarify" | "route_to_approval" | "escalate";

export type GuardrailCode =
  | "unknown_caller"
  | "site_access_denied"
  | "missing_required_fields"
  | "budget_exceeded"
  | "restricted_finance_access"
  | "duplicate_request"
  | "approval_bypass_attempt"
  | "emergency_escalation"
  | "extraction_failed";

export interface Organization {
  id: string;
  name: string;
}

export interface Role {
  id: string;
  orgId: string;
  name: RoleName;
}

export interface Site {
  id: string;
  orgId: string;
  name: string;
  managerUserId: string;
}

export interface User {
  id: string;
  orgId: string;
  roleId: string;
  name: string;
  title: string;
}

export interface PhoneIdentity {
  id: string;
  orgId: string;
  userId: string;
  phoneNumber: string;
  label: string;
}

export interface UserSiteAccess {
  id: string;
  orgId: string;
  userId: string;
  siteId: string;
}

export interface Material {
  id: string;
  orgId: string;
  sku: string;
  name: string;
  unit: string;
  unitCost: number;
}

export interface Vendor {
  id: string;
  orgId: string;
  name: string;
}

export interface SiteStock {
  id: string;
  orgId: string;
  siteId: string;
  materialId: string;
  availableQuantity: number;
}

export interface Budget {
  id: string;
  orgId: string;
  siteId: string;
  monthlyLimit: number;
  committedAmount: number;
}

export interface PurchaseOrder {
  id: string;
  orgId: string;
  siteId: string;
  vendorId: string;
  code: string;
  status: string;
  expectedDeliveryDate: string;
  nextStep: string;
}

export interface VendorInvoice {
  id: string;
  orgId: string;
  vendorId: string;
  paymentStatus: "paid" | "scheduled" | "overdue";
  invoiceCode: string;
  amount: number;
}

export interface Requisition {
  id: string;
  orgId: string;
  siteId: string;
  requestedByUserId: string;
  status: "draft" | "submitted";
  idempotencyKey: string;
  interactionId: string;
  totalCost: number;
  neededBy: string;
}

export interface RequisitionLine {
  id: string;
  orgId: string;
  requisitionId: string;
  materialId: string;
  quantity: number;
}

export interface ApprovalRequest {
  id: string;
  orgId: string;
  siteId: string;
  requestedByUserId: string;
  interactionId: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  idempotencyKey: string;
}

export interface SiteIssue {
  id: string;
  orgId: string;
  siteId: string;
  reportedByUserId: string;
  interactionId: string;
  severity: "high";
  summary: string;
  idempotencyKey: string;
}

export interface VoiceInteraction {
  id: string;
  orgId: string;
  siteId: string | null;
  callerPhone: string;
  callerId: string | null;
  transcript: string;
  intent: IntentType;
  extractedFields: Record<string, unknown>;
  actionAttempted: string;
  policyDecision: PolicyDecision;
  outcome: string;
  createdAt: string;
}

export interface VoiceActionLog {
  id: string;
  orgId: string;
  interactionId: string;
  actionName: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  orgId: string;
  interactionId: string;
  actionName: string;
  requestBody: Record<string, unknown>;
  responseBody: Record<string, unknown>;
  createdAt: string;
}

export interface GuardrailEvent {
  id: string;
  orgId: string;
  interactionId: string;
  code: GuardrailCode;
  reason: string;
  createdAt: string;
}

export interface MessageFollowup {
  id: string;
  orgId: string;
  interactionId: string;
  channel: "sms";
  message: string;
  createdAt: string;
}

export interface EvalRun {
  id: string;
  startedAt: string;
  completedAt: string;
  failCount: number;
  intentAccuracy: number;
  fieldExtractionAccuracy: number;
  actionAccuracy: number;
  guardrailAccuracy: number;
  unsafeActionRate: number;
  unsafeActionCount: number;
  clarificationAccuracy: number;
  auditCoverage: number;
  policyBypassDefenseRate: number;
  financePrivacyPassRate: number;
  duplicatePreventionPassRate: number;
  createdRequisitionsCount: number;
  createdApprovalsCount: number;
  createdEscalationsCount: number;
  missingAuditLogCount: number;
  readinessStatus: "ready" | "conditionally_ready" | "not_ready";
}

export interface EvalScenarioResult {
  id: string;
  evalRunId: string;
  scenarioId: string;
  passed: boolean;
  notes: string[];
}

export interface DemoDatabase {
  organizations: Organization[];
  roles: Role[];
  users: User[];
  sites: Site[];
  phoneIdentities: PhoneIdentity[];
  userSiteAccess: UserSiteAccess[];
  materials: Material[];
  vendors: Vendor[];
  siteStock: SiteStock[];
  budgets: Budget[];
  purchaseOrders: PurchaseOrder[];
  vendorInvoices: VendorInvoice[];
  requisitions: Requisition[];
  requisitionLines: RequisitionLine[];
  approvalRequests: ApprovalRequest[];
  siteIssues: SiteIssue[];
  voiceInteractions: VoiceInteraction[];
  voiceActionLogs: VoiceActionLog[];
  webhookEvents: WebhookEvent[];
  guardrailEvents: GuardrailEvent[];
  messageFollowups: MessageFollowup[];
  evalRuns: EvalRun[];
  evalResults: EvalScenarioResult[];
}

export interface CallerContext {
  known: boolean;
  userId: string;
  name: string;
  orgId: string;
  role: RoleName;
  siteIds: string[];
}

export interface PolicyCheckResult {
  name:
    | "caller_known"
    | "site_access_allowed"
    | "role_can_create_requisition"
    | "role_can_view_finance"
    | "required_fields_present"
    | "budget_within_limit"
    | "duplicate_request_check"
    | "approval_bypass_attempt"
    | "emergency_escalation"
    | "read_only_action_allowed"
    | "mutation_requires_authorized_caller";
  passed: boolean;
  reason: string;
}
