import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { getPostgresDb, postgresEnabled } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed-data";
import { getDemoDb, resetDemoDb } from "@/lib/db/store";
import type {
  ApprovalRequest,
  AdapterAttempt,
  AdapterFailureMode,
  ActionLifecycleState,
  ActionRequest,
  CallerContext,
  CustomerConfig,
  DemoDatabase,
  EvalRun,
  EvalScenarioResult,
  GuardrailEvent,
  MessageFollowup,
  Requisition,
  SiteIssue,
  VoiceActionLog,
  VoiceInteraction,
  WebhookEvent
} from "@/lib/db/types";

type RepositoryMode = "auto" | "memory" | "postgres";

interface InteractionInput {
  interactionId: string;
  orgId: string;
  siteId: string | null;
  callerPhone: string;
  callerId: string | null;
  transcript: string;
  intent: VoiceInteraction["intent"];
  extractedFields: Record<string, unknown>;
  actionAttempted: string;
  policyDecision: VoiceInteraction["policyDecision"];
  outcome: string;
}

interface ActionLogInput {
  orgId: string;
  interactionId: string;
  actionName: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}

interface WebhookEventInput {
  orgId: string;
  interactionId: string;
  actionName: string;
  requestBody: Record<string, unknown>;
  responseBody: Record<string, unknown>;
}

interface ActionRequestInput {
  orgId: string;
  customerConfigKey: string;
  interactionId: string;
  actionName: ActionRequest["actionName"];
  idempotencyKey: string;
  fingerprint: string;
  lifecycleState: ActionLifecycleState;
  policyDecision: ActionRequest["policyDecision"];
}

interface ActionRequestUpdate {
  lifecycleState?: ActionLifecycleState;
  policyDecision?: ActionRequest["policyDecision"];
  approvalRequestId?: string | null;
  resultPayload?: Record<string, unknown> | null;
  errorCode?: string | null;
}

interface AdapterAttemptInput {
  orgId: string;
  actionRequestId: string;
  adapterName: string;
  failureMode: AdapterFailureMode;
  status: AdapterAttempt["status"];
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
}

function asNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function asIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

type DbClient = NodePgDatabase<typeof schema>;

class MemoryRepository {
  private db(): DemoDatabase {
    return getDemoDb();
  }

  async countPhoneIdentities() {
    return this.db().phoneIdentities.length;
  }

  async getCustomerConfigByKey(key: string): Promise<CustomerConfig | null> {
    return this.db().customerConfigs.find((item) => item.key === key) ?? null;
  }

  async listCustomerConfigs() {
    return [...this.db().customerConfigs];
  }

  async resolveCallerByPhone(callerPhone: string): Promise<CallerContext | null> {
    const db = this.db();
    const identity = db.phoneIdentities.find((item) => item.phoneNumber === callerPhone);
    if (!identity) {
      return null;
    }

    const user = db.users.find((item) => item.id === identity.userId);
    const role = db.roles.find((item) => item.id === user?.roleId);
    const siteIds = db.userSiteAccess.filter((item) => item.userId === user?.id).map((item) => item.siteId);
    if (!user || !role) {
      return null;
    }

    return {
      known: true,
      userId: user.id,
      name: user.name,
      orgId: user.orgId,
      role: role.name as CallerContext["role"],
      siteIds
    } satisfies CallerContext;
  }

  async findSiteByName(siteName: string) {
    const normalized = siteName.trim().toLowerCase();
    return this.db().sites.find((site) => site.name.toLowerCase() === normalized) ?? null;
  }

  async findMaterialByName(materialName: string) {
    const normalized = materialName.trim().toLowerCase();
    return this.db().materials.find((material) => material.name.toLowerCase() === normalized) ?? null;
  }

  async checkStock(siteName: string, materialName: string) {
    const site = await this.findSiteByName(siteName);
    const material = await this.findMaterialByName(materialName);
    if (!site || !material) {
      return null;
    }

    const stock = this.db().siteStock.find(
      (item) => item.siteId === site.id && item.materialId === material.id
    );

    return {
      site,
      material,
      availableQuantity: stock?.availableQuantity ?? 0
    };
  }

  async getBudgetStatus(input: { siteName: string; materialName: string; quantity: number }) {
    const site = await this.findSiteByName(input.siteName);
    const material = await this.findMaterialByName(input.materialName);
    if (!site || !material) {
      return { withinLimit: false, estimatedCost: 0, remainingBudget: 0, budget: null };
    }

    const budget = this.db().budgets.find((item) => item.siteId === site.id) ?? null;
    const estimatedCost = material.unitCost * input.quantity;
    const remainingBudget = budget ? budget.monthlyLimit - budget.committedAmount : 0;
    return {
      withinLimit: estimatedCost <= remainingBudget,
      estimatedCost,
      remainingBudget,
      budget
    };
  }

  async findDuplicateMaterialRequest(input: {
    callerUserId: string;
    siteId: string;
    materialName: string;
    quantity: number;
    neededBy: string;
  }) {
    const db = this.db();
    const material = await this.findMaterialByName(input.materialName);
    if (!material) {
      return null;
    }

    return (
      db.requisitions.find((requisition) => {
        if (
          requisition.requestedByUserId !== input.callerUserId ||
          requisition.siteId !== input.siteId ||
          requisition.neededBy !== input.neededBy
        ) {
          return false;
        }

        const line = db.requisitionLines.find((item) => item.requisitionId === requisition.id);
        return line?.materialId === material.id && line.quantity === input.quantity;
      }) ?? null
    );
  }

  async findRequisitionByIdempotency(idempotencyKey: string) {
    return this.db().requisitions.find((item) => item.idempotencyKey === idempotencyKey) ?? null;
  }

  async createRequisition(input: {
    interactionId: string;
    callerUserId: string;
    siteName: string;
    materialName: string;
    quantity: number;
    neededBy: string;
    idempotencyKey: string;
  }) {
    const db = this.db();
    const existing = await this.findRequisitionByIdempotency(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const site = await this.findSiteByName(input.siteName);
    const material = await this.findMaterialByName(input.materialName);
    if (!site || !material) {
      return null;
    }

    const concurrent = db.requisitions.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (concurrent) {
      return concurrent;
    }

    const requisition: Requisition = {
      id: createId("req"),
      orgId: site.orgId,
      siteId: site.id,
      requestedByUserId: input.callerUserId,
      status: "draft",
      idempotencyKey: input.idempotencyKey,
      interactionId: input.interactionId,
      totalCost: material.unitCost * input.quantity,
      neededBy: input.neededBy
    };

    db.requisitions.push(requisition);
    db.requisitionLines.push({
      id: createId("req-line"),
      orgId: site.orgId,
      requisitionId: requisition.id,
      materialId: material.id,
      quantity: input.quantity
    });
    return requisition;
  }

  async findApprovalByIdempotency(idempotencyKey: string) {
    return this.db().approvalRequests.find((item) => item.idempotencyKey === idempotencyKey) ?? null;
  }

  async createApprovalRequest(input: {
    interactionId: string;
    callerUserId: string;
    siteName: string;
    reason: string;
    idempotencyKey: string;
  }) {
    const db = this.db();
    const existing = await this.findApprovalByIdempotency(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const site = await this.findSiteByName(input.siteName);
    if (!site) {
      return null;
    }

    const concurrent = db.approvalRequests.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (concurrent) {
      return concurrent;
    }

    const approval: ApprovalRequest = {
      id: createId("approval"),
      orgId: site.orgId,
      siteId: site.id,
      requestedByUserId: input.callerUserId,
      interactionId: input.interactionId,
      reason: input.reason,
      status: "pending",
      idempotencyKey: input.idempotencyKey
    };

    db.approvalRequests.push(approval);
    return approval;
  }

  async getApprovalRequestById(id: string) {
    return this.db().approvalRequests.find((item) => item.id === id) ?? null;
  }

  async updateApprovalRequestStatus(id: string, status: ApprovalRequest["status"]) {
    const approval = this.db().approvalRequests.find((item) => item.id === id);
    if (!approval) {
      return null;
    }

    approval.status = status;
    return approval;
  }

  async getPurchaseOrderStatus(poCode: string) {
    const po = this.db().purchaseOrders.find((item) => item.code.toLowerCase() === poCode.trim().toLowerCase());
    if (!po) {
      return null;
    }

    const vendor = this.db().vendors.find((item) => item.id === po.vendorId);
    return {
      ...po,
      vendorName: vendor?.name ?? "Unknown vendor"
    };
  }

  async getVendorPaymentStatus(vendorName: string) {
    const vendor = this.db().vendors.find(
      (item) => item.name.toLowerCase() === vendorName.trim().toLowerCase()
    );
    if (!vendor) {
      return null;
    }

    const invoices = this.db().vendorInvoices.filter((item) => item.vendorId === vendor.id);
    return { vendor, invoices };
  }

  async findEscalationByIdempotency(idempotencyKey: string) {
    return this.db().siteIssues.find((item) => item.idempotencyKey === idempotencyKey) ?? null;
  }

  async createSiteIssue(input: {
    interactionId: string;
    callerUserId: string;
    siteName: string;
    issueSummary: string;
    idempotencyKey: string;
  }) {
    const db = this.db();
    const existing = await this.findEscalationByIdempotency(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const site = await this.findSiteByName(input.siteName);
    if (!site) {
      return null;
    }

    const concurrent = db.siteIssues.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (concurrent) {
      return concurrent;
    }

    const issue: SiteIssue = {
      id: createId("issue"),
      orgId: site.orgId,
      siteId: site.id,
      reportedByUserId: input.callerUserId,
      interactionId: input.interactionId,
      severity: "high",
      summary: input.issueSummary,
      idempotencyKey: input.idempotencyKey
    };

    db.siteIssues.push(issue);
    return issue;
  }

  async getActionRequestByIdempotency(idempotencyKey: string) {
    return this.db().actionRequests.find((item) => item.idempotencyKey === idempotencyKey) ?? null;
  }

  async getActionRequestById(id: string) {
    return this.db().actionRequests.find((item) => item.id === id) ?? null;
  }

  async getActionRequestByApprovalId(approvalRequestId: string) {
    return this.db().actionRequests.find((item) => item.approvalRequestId === approvalRequestId) ?? null;
  }

  async createActionRequest(input: ActionRequestInput) {
    const existing = this.db().actionRequests.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (existing) {
      return { actionRequest: existing, reused: true };
    }

    const now = new Date().toISOString();
    const actionRequest: ActionRequest = {
      id: createId("action-request"),
      ...input,
      approvalRequestId: null,
      resultPayload: null,
      errorCode: null,
      createdAt: now,
      updatedAt: now
    };
    this.db().actionRequests.push(actionRequest);
    return { actionRequest, reused: false };
  }

  async updateActionRequest(id: string, update: ActionRequestUpdate) {
    const actionRequest = this.db().actionRequests.find((item) => item.id === id);
    if (!actionRequest) {
      return null;
    }

    Object.assign(actionRequest, update, { updatedAt: new Date().toISOString() });
    return actionRequest;
  }

  /** Compare-and-set: applies `update` only if the action request is currently in one of `from`. */
  async transitionActionRequest(id: string, from: ActionLifecycleState[], update: ActionRequestUpdate) {
    const actionRequest = this.db().actionRequests.find((item) => item.id === id);
    if (!actionRequest || !from.includes(actionRequest.lifecycleState)) {
      return null;
    }

    Object.assign(actionRequest, update, { updatedAt: new Date().toISOString() });
    return actionRequest;
  }

  async recordAdapterAttempt(input: AdapterAttemptInput) {
    const attempts = this.db().adapterAttempts.filter((item) => item.actionRequestId === input.actionRequestId);
    const attempt: AdapterAttempt = {
      id: createId("adapter-attempt"),
      ...input,
      attemptNumber: attempts.length + 1,
      createdAt: new Date().toISOString()
    };
    this.db().adapterAttempts.push(attempt);
    return attempt;
  }

  async listAdapterAttemptsByActionRequest(actionRequestId: string) {
    return this.db().adapterAttempts.filter((item) => item.actionRequestId === actionRequestId);
  }

  async listActionRequests() {
    return [...this.db().actionRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveFollowup(input: { orgId: string; interactionId: string; message: string }) {
    const followup: MessageFollowup = {
      id: createId("followup"),
      orgId: input.orgId,
      interactionId: input.interactionId,
      channel: "sms",
      message: input.message,
      createdAt: new Date().toISOString()
    };
    this.db().messageFollowups.push(followup);
    return followup;
  }

  async createInteraction(input: InteractionInput) {
    const existing = this.db().voiceInteractions.find((item) => item.id === input.interactionId);
    const row = {
      id: input.interactionId,
      ...input,
      createdAt: new Date().toISOString()
    };
    if (existing) {
      Object.assign(existing, row, { createdAt: existing.createdAt });
      return;
    }
    this.db().voiceInteractions.push(row);
  }

  async createActionLog(input: ActionLogInput) {
    const db = this.db();
    const log: VoiceActionLog = {
      id: createId("action-log"),
      orgId: input.orgId,
      interactionId: input.interactionId,
      actionName: input.actionName,
      requestPayload: input.requestPayload,
      responsePayload: input.responsePayload,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      createdAt: new Date().toISOString()
    };
    db.voiceActionLogs.push(log);
  }

  async createWebhookEvent(input: WebhookEventInput) {
    const db = this.db();
    const event: WebhookEvent = {
      id: createId("webhook"),
      orgId: input.orgId,
      interactionId: input.interactionId,
      actionName: input.actionName,
      requestBody: input.requestBody,
      responseBody: input.responseBody,
      createdAt: new Date().toISOString()
    };
    db.webhookEvents.push(event);
  }

  async createGuardrailEvents(input: {
    orgId: string;
    interactionId: string;
    guardrails: Array<{ code: GuardrailEvent["code"]; reason: string }>;
  }) {
    const db = this.db();
    input.guardrails.forEach((guardrail) => {
      db.guardrailEvents.push({
        id: createId("guardrail"),
        orgId: input.orgId,
        interactionId: input.interactionId,
        code: guardrail.code,
        reason: guardrail.reason,
        createdAt: new Date().toISOString()
      });
    });
  }

  async listInteractions() {
    return [...this.db().voiceInteractions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getInteractionById(id: string) {
    return this.db().voiceInteractions.find((item) => item.id === id) ?? null;
  }

  async listActionLogsByInteraction(interactionId: string) {
    return this.db().voiceActionLogs.filter((item) => item.interactionId === interactionId);
  }

  async listWebhookEventsByInteraction(interactionId: string) {
    return this.db().webhookEvents.filter((item) => item.interactionId === interactionId);
  }

  async listGuardrailsByInteraction(interactionId: string) {
    return this.db().guardrailEvents.filter((item) => item.interactionId === interactionId);
  }

  async getFollowupByInteraction(interactionId: string) {
    return (
      this.db().messageFollowups
        .filter((item) => item.interactionId === interactionId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }

  async listRequisitions() {
    return [...this.db().requisitions];
  }

  async listRequisitionsByInteraction(interactionId: string) {
    return this.db().requisitions.filter((item) => item.interactionId === interactionId);
  }

  async listApprovalRequests() {
    return [...this.db().approvalRequests];
  }

  async listApprovalRequestsByInteraction(interactionId: string) {
    return this.db().approvalRequests.filter((item) => item.interactionId === interactionId);
  }

  async listSiteIssuesByInteraction(interactionId: string) {
    return this.db().siteIssues.filter((item) => item.interactionId === interactionId);
  }

  async getLatestEvalRun() {
    return this.db().evalRuns.at(-1) ?? null;
  }

  async recordEvalRun(input: Omit<EvalRun, "id"> & { results: Array<Omit<EvalScenarioResult, "id" | "evalRunId">> }) {
    const db = this.db();
    const evalRunId = createId("eval-run");
    db.evalRuns.push({ id: evalRunId, ...input });
    input.results.forEach((result) => {
      db.evalResults.push({
        id: createId("eval-result"),
        evalRunId,
        scenarioId: result.scenarioId,
        passed: result.passed,
        notes: result.notes
      });
    });
    return evalRunId;
  }

  async resetAndSeed() {
    resetDemoDb();
  }
}

class PostgresRepository {
  constructor(private readonly db: DbClient) {}

  private async insertIfAny<T>(table: Parameters<DbClient["insert"]>[0], rows: T[]) {
    if (rows.length === 0) {
      return;
    }

    await this.db.insert(table).values(rows as never);
  }

  async countPhoneIdentities() {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)` }).from(schema.phoneIdentities);
    return Number(count);
  }

  async getCustomerConfigByKey(key: string): Promise<CustomerConfig | null> {
    const row =
      (
        await this.db
          .select()
          .from(schema.customerConfigs)
          .where(eq(schema.customerConfigs.key, key))
          .limit(1)
      )[0] ?? null;
    return row
      ? {
          ...row,
          allowedSiteIds: row.allowedSiteIds as CustomerConfig["allowedSiteIds"],
          rolePermissions: row.rolePermissions as CustomerConfig["rolePermissions"],
          financeVisibleRoles: row.financeVisibleRoles as CustomerConfig["financeVisibleRoles"],
          materialApprovalLimit: asNumber(row.materialApprovalLimit),
          escalationRules: row.escalationRules as CustomerConfig["escalationRules"],
          blandPathwayMappings: row.blandPathwayMappings as CustomerConfig["blandPathwayMappings"]
        }
      : null;
  }

  async listCustomerConfigs() {
    const rows = await this.db.select().from(schema.customerConfigs);
    return rows.map((row) => ({
      ...row,
      allowedSiteIds: row.allowedSiteIds as CustomerConfig["allowedSiteIds"],
      rolePermissions: row.rolePermissions as CustomerConfig["rolePermissions"],
      financeVisibleRoles: row.financeVisibleRoles as CustomerConfig["financeVisibleRoles"],
      materialApprovalLimit: asNumber(row.materialApprovalLimit),
      escalationRules: row.escalationRules as CustomerConfig["escalationRules"],
      blandPathwayMappings: row.blandPathwayMappings as CustomerConfig["blandPathwayMappings"]
    }));
  }

  async resolveCallerByPhone(callerPhone: string): Promise<CallerContext | null> {
    const identity = (
      await this.db
        .select()
        .from(schema.phoneIdentities)
        .where(eq(schema.phoneIdentities.phoneNumber, callerPhone))
        .limit(1)
    )[0];
    if (!identity) {
      return null;
    }

    const user = (
      await this.db.select().from(schema.users).where(eq(schema.users.id, identity.userId)).limit(1)
    )[0];
    if (!user) {
      return null;
    }

    const role = (
      await this.db.select().from(schema.roles).where(eq(schema.roles.id, user.roleId)).limit(1)
    )[0];
    if (!role) {
      return null;
    }

    const siteIds = (
      await this.db
        .select({ siteId: schema.userSiteAccess.siteId })
        .from(schema.userSiteAccess)
        .where(eq(schema.userSiteAccess.userId, user.id))
    ).map((row) => row.siteId);

    return {
      known: true,
      userId: user.id,
      name: user.name,
      orgId: user.orgId,
      role: role.name as CallerContext["role"],
      siteIds
    } satisfies CallerContext;
  }

  async findSiteByName(siteName: string) {
    const normalized = siteName.trim().toLowerCase();
    return (
      (
        await this.db
          .select()
          .from(schema.sites)
          .where(sql`lower(${schema.sites.name}) = ${normalized}`)
          .limit(1)
      )[0] ?? null
    );
  }

  async findMaterialByName(materialName: string) {
    const normalized = materialName.trim().toLowerCase();
    const row =
      (
        await this.db
          .select()
          .from(schema.materials)
          .where(sql`lower(${schema.materials.name}) = ${normalized}`)
          .limit(1)
      )[0] ?? null;

    return row
      ? {
          ...row,
          unitCost: asNumber(row.unitCost)
        }
      : null;
  }

  async checkStock(siteName: string, materialName: string) {
    const site = await this.findSiteByName(siteName);
    const material = await this.findMaterialByName(materialName);
    if (!site || !material) {
      return null;
    }

    const stock =
      (
        await this.db
          .select()
          .from(schema.siteStock)
          .where(and(eq(schema.siteStock.siteId, site.id), eq(schema.siteStock.materialId, material.id)))
          .limit(1)
      )[0] ?? null;

    return {
      site,
      material,
      availableQuantity: stock?.availableQuantity ?? 0
    };
  }

  async getBudgetStatus(input: { siteName: string; materialName: string; quantity: number }) {
    const site = await this.findSiteByName(input.siteName);
    const material = await this.findMaterialByName(input.materialName);
    if (!site || !material) {
      return { withinLimit: false, estimatedCost: 0, remainingBudget: 0, budget: null };
    }

    const row =
      (
        await this.db
          .select()
          .from(schema.budgets)
          .where(eq(schema.budgets.siteId, site.id))
          .limit(1)
      )[0] ?? null;

    const budget = row
      ? {
          ...row,
          monthlyLimit: asNumber(row.monthlyLimit),
          committedAmount: asNumber(row.committedAmount)
        }
      : null;
    const estimatedCost = material.unitCost * input.quantity;
    const remainingBudget = budget ? budget.monthlyLimit - budget.committedAmount : 0;
    return {
      withinLimit: estimatedCost <= remainingBudget,
      estimatedCost,
      remainingBudget,
      budget
    };
  }

  async findDuplicateMaterialRequest(input: {
    callerUserId: string;
    siteId: string;
    materialName: string;
    quantity: number;
    neededBy: string;
  }) {
    const material = await this.findMaterialByName(input.materialName);
    if (!material) {
      return null;
    }

    const requisitionRows = await this.db
      .select()
      .from(schema.requisitions)
      .where(
        and(
          eq(schema.requisitions.requestedByUserId, input.callerUserId),
          eq(schema.requisitions.siteId, input.siteId),
          eq(schema.requisitions.neededBy, input.neededBy)
        )
      );

    for (const requisition of requisitionRows) {
      const line =
        (
          await this.db
            .select()
            .from(schema.requisitionLines)
            .where(eq(schema.requisitionLines.requisitionId, requisition.id))
            .limit(1)
        )[0] ?? null;
      if (line?.materialId === material.id && line.quantity === input.quantity) {
        return {
          ...requisition,
          totalCost: asNumber(requisition.totalCost)
        };
      }
    }

    return null;
  }

  async findRequisitionByIdempotency(idempotencyKey: string) {
    const row =
      (
        await this.db
          .select()
          .from(schema.requisitions)
          .where(eq(schema.requisitions.idempotencyKey, idempotencyKey))
          .limit(1)
      )[0] ?? null;
    return row ? { ...row, totalCost: asNumber(row.totalCost) } : null;
  }

  async createRequisition(input: {
    interactionId: string;
    callerUserId: string;
    siteName: string;
    materialName: string;
    quantity: number;
    neededBy: string;
    idempotencyKey: string;
  }) {
    const existing = await this.findRequisitionByIdempotency(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const site = await this.findSiteByName(input.siteName);
    const material = await this.findMaterialByName(input.materialName);
    if (!site || !material) {
      return null;
    }

    const requisitionId = createId("req");
    const totalCost = material.unitCost * input.quantity;
    const created = await this.db.transaction(async (tx) => {
      // The unique idempotency index makes this the single atomic claim: a concurrent duplicate
      // inserts nothing and falls through to the existing row below.
      const inserted = await tx
        .insert(schema.requisitions)
        .values({
          id: requisitionId,
          orgId: site.orgId,
          siteId: site.id,
          requestedByUserId: input.callerUserId,
          status: "draft",
          idempotencyKey: input.idempotencyKey,
          interactionId: input.interactionId,
          totalCost: totalCost.toString(),
          neededBy: input.neededBy
        })
        .onConflictDoNothing({ target: schema.requisitions.idempotencyKey })
        .returning({ id: schema.requisitions.id });
      if (inserted.length === 0) {
        return false;
      }

      await tx.insert(schema.requisitionLines).values({
        id: createId("req-line"),
        orgId: site.orgId,
        requisitionId,
        materialId: material.id,
        quantity: input.quantity
      });
      return true;
    });

    if (!created) {
      return this.findRequisitionByIdempotency(input.idempotencyKey);
    }

    return {
      id: requisitionId,
      orgId: site.orgId,
      siteId: site.id,
      requestedByUserId: input.callerUserId,
      status: "draft" as const,
      idempotencyKey: input.idempotencyKey,
      interactionId: input.interactionId,
      totalCost,
      neededBy: input.neededBy
    };
  }

  async findApprovalByIdempotency(idempotencyKey: string) {
    return (
      (
        await this.db
          .select()
          .from(schema.approvalRequests)
          .where(eq(schema.approvalRequests.idempotencyKey, idempotencyKey))
          .limit(1)
      )[0] ?? null
    );
  }

  async createApprovalRequest(input: {
    interactionId: string;
    callerUserId: string;
    siteName: string;
    reason: string;
    idempotencyKey: string;
  }) {
    const existing = await this.findApprovalByIdempotency(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const site = await this.findSiteByName(input.siteName);
    if (!site) {
      return null;
    }

    const approval: ApprovalRequest = {
      id: createId("approval"),
      orgId: site.orgId,
      siteId: site.id,
      requestedByUserId: input.callerUserId,
      interactionId: input.interactionId,
      reason: input.reason,
      status: "pending",
      idempotencyKey: input.idempotencyKey
    };

    const inserted = await this.db
      .insert(schema.approvalRequests)
      .values(approval)
      .onConflictDoNothing({ target: schema.approvalRequests.idempotencyKey })
      .returning({ id: schema.approvalRequests.id });
    return inserted.length > 0 ? approval : this.findApprovalByIdempotency(input.idempotencyKey);
  }

  async getApprovalRequestById(id: string) {
    return (
      (
        await this.db
          .select()
          .from(schema.approvalRequests)
          .where(eq(schema.approvalRequests.id, id))
          .limit(1)
      )[0] ?? null
    );
  }

  async updateApprovalRequestStatus(id: string, status: ApprovalRequest["status"]) {
    const [row] = await this.db
      .update(schema.approvalRequests)
      .set({ status })
      .where(eq(schema.approvalRequests.id, id))
      .returning();
    return row ?? null;
  }

  async getPurchaseOrderStatus(poCode: string) {
    const po =
      (
        await this.db
          .select()
          .from(schema.purchaseOrders)
          .where(sql`lower(${schema.purchaseOrders.code}) = ${poCode.trim().toLowerCase()}`)
          .limit(1)
      )[0] ?? null;
    if (!po) {
      return null;
    }

    const vendor =
      (
        await this.db
          .select()
          .from(schema.vendors)
          .where(eq(schema.vendors.id, po.vendorId))
          .limit(1)
      )[0] ?? null;

    return {
      ...po,
      vendorName: vendor?.name ?? "Unknown vendor"
    };
  }

  async getVendorPaymentStatus(vendorName: string) {
    const vendor =
      (
        await this.db
          .select()
          .from(schema.vendors)
          .where(sql`lower(${schema.vendors.name}) = ${vendorName.trim().toLowerCase()}`)
          .limit(1)
      )[0] ?? null;
    if (!vendor) {
      return null;
    }

    const invoiceRows = await this.db
      .select()
      .from(schema.vendorInvoices)
      .where(eq(schema.vendorInvoices.vendorId, vendor.id));

    return {
      vendor,
      invoices: invoiceRows.map((item) => ({ ...item, amount: asNumber(item.amount) }))
    };
  }

  async findEscalationByIdempotency(idempotencyKey: string) {
    return (
      (
        await this.db
          .select()
          .from(schema.siteIssues)
          .where(eq(schema.siteIssues.idempotencyKey, idempotencyKey))
          .limit(1)
      )[0] ?? null
    );
  }

  async createSiteIssue(input: {
    interactionId: string;
    callerUserId: string;
    siteName: string;
    issueSummary: string;
    idempotencyKey: string;
  }) {
    const existing = await this.findEscalationByIdempotency(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const site = await this.findSiteByName(input.siteName);
    if (!site) {
      return null;
    }

    const issue: SiteIssue = {
      id: createId("issue"),
      orgId: site.orgId,
      siteId: site.id,
      reportedByUserId: input.callerUserId,
      interactionId: input.interactionId,
      severity: "high",
      summary: input.issueSummary,
      idempotencyKey: input.idempotencyKey
    };
    const inserted = await this.db
      .insert(schema.siteIssues)
      .values(issue)
      .onConflictDoNothing({ target: schema.siteIssues.idempotencyKey })
      .returning({ id: schema.siteIssues.id });
    return inserted.length > 0 ? issue : this.findEscalationByIdempotency(input.idempotencyKey);
  }

  async getActionRequestByIdempotency(idempotencyKey: string) {
    const row =
      (
        await this.db
          .select()
          .from(schema.actionRequests)
          .where(eq(schema.actionRequests.idempotencyKey, idempotencyKey))
          .limit(1)
      )[0] ?? null;
    return row
      ? {
          ...row,
          actionName: row.actionName as ActionRequest["actionName"],
          lifecycleState: row.lifecycleState as ActionRequest["lifecycleState"],
          policyDecision: row.policyDecision as ActionRequest["policyDecision"],
          resultPayload: (row.resultPayload as Record<string, unknown> | null) ?? null,
          createdAt: asIsoString(row.createdAt),
          updatedAt: asIsoString(row.updatedAt)
        }
      : null;
  }

  async getActionRequestById(id: string) {
    const row =
      (
        await this.db
          .select()
          .from(schema.actionRequests)
          .where(eq(schema.actionRequests.id, id))
          .limit(1)
      )[0] ?? null;
    return row
      ? {
          ...row,
          actionName: row.actionName as ActionRequest["actionName"],
          lifecycleState: row.lifecycleState as ActionRequest["lifecycleState"],
          policyDecision: row.policyDecision as ActionRequest["policyDecision"],
          resultPayload: (row.resultPayload as Record<string, unknown> | null) ?? null,
          createdAt: asIsoString(row.createdAt),
          updatedAt: asIsoString(row.updatedAt)
        }
      : null;
  }

  async getActionRequestByApprovalId(approvalRequestId: string) {
    const row =
      (
        await this.db
          .select()
          .from(schema.actionRequests)
          .where(eq(schema.actionRequests.approvalRequestId, approvalRequestId))
          .limit(1)
      )[0] ?? null;
    return row
      ? {
          ...row,
          actionName: row.actionName as ActionRequest["actionName"],
          lifecycleState: row.lifecycleState as ActionRequest["lifecycleState"],
          policyDecision: row.policyDecision as ActionRequest["policyDecision"],
          resultPayload: (row.resultPayload as Record<string, unknown> | null) ?? null,
          createdAt: asIsoString(row.createdAt),
          updatedAt: asIsoString(row.updatedAt)
        }
      : null;
  }

  async createActionRequest(input: ActionRequestInput) {
    const now = new Date();
    const id = createId("action-request");
    await this.db
      .insert(schema.actionRequests)
      .values({
        id,
        orgId: input.orgId,
        customerConfigKey: input.customerConfigKey,
        interactionId: input.interactionId,
        actionName: input.actionName,
        idempotencyKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
        lifecycleState: input.lifecycleState,
        policyDecision: input.policyDecision,
        approvalRequestId: null,
        resultPayload: null,
        errorCode: null,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoNothing({ target: schema.actionRequests.idempotencyKey });

    const actionRequest = await this.getActionRequestByIdempotency(input.idempotencyKey);
    if (!actionRequest) {
      throw new Error(`Failed to claim action request for idempotency key ${input.idempotencyKey}`);
    }

    return { actionRequest, reused: actionRequest.id !== id };
  }

  async updateActionRequest(id: string, update: ActionRequestUpdate) {
    const [row] = await this.db
      .update(schema.actionRequests)
      .set({
        ...(update.lifecycleState ? { lifecycleState: update.lifecycleState } : {}),
        ...(update.policyDecision ? { policyDecision: update.policyDecision } : {}),
        ...(Object.prototype.hasOwnProperty.call(update, "approvalRequestId")
          ? { approvalRequestId: update.approvalRequestId ?? null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(update, "resultPayload")
          ? { resultPayload: update.resultPayload ?? null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(update, "errorCode") ? { errorCode: update.errorCode ?? null } : {}),
        updatedAt: new Date()
      })
      .where(eq(schema.actionRequests.id, id))
      .returning();

    return row
      ? {
          ...row,
          actionName: row.actionName as ActionRequest["actionName"],
          lifecycleState: row.lifecycleState as ActionRequest["lifecycleState"],
          policyDecision: row.policyDecision as ActionRequest["policyDecision"],
          resultPayload: (row.resultPayload as Record<string, unknown> | null) ?? null,
          createdAt: asIsoString(row.createdAt),
          updatedAt: asIsoString(row.updatedAt)
        }
      : null;
  }

  /** Compare-and-set: applies `update` only if the action request is currently in one of `from`. */
  async transitionActionRequest(id: string, from: ActionLifecycleState[], update: ActionRequestUpdate) {
    const [row] = await this.db
      .update(schema.actionRequests)
      .set({
        ...(update.lifecycleState ? { lifecycleState: update.lifecycleState } : {}),
        ...(update.policyDecision ? { policyDecision: update.policyDecision } : {}),
        ...(Object.prototype.hasOwnProperty.call(update, "approvalRequestId")
          ? { approvalRequestId: update.approvalRequestId ?? null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(update, "resultPayload")
          ? { resultPayload: update.resultPayload ?? null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(update, "errorCode") ? { errorCode: update.errorCode ?? null } : {}),
        updatedAt: new Date()
      })
      .where(and(eq(schema.actionRequests.id, id), inArray(schema.actionRequests.lifecycleState, from)))
      .returning();

    return row
      ? {
          ...row,
          actionName: row.actionName as ActionRequest["actionName"],
          lifecycleState: row.lifecycleState as ActionRequest["lifecycleState"],
          policyDecision: row.policyDecision as ActionRequest["policyDecision"],
          resultPayload: (row.resultPayload as Record<string, unknown> | null) ?? null,
          createdAt: asIsoString(row.createdAt),
          updatedAt: asIsoString(row.updatedAt)
        }
      : null;
  }

  async recordAdapterAttempt(input: AdapterAttemptInput) {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.adapterAttempts)
      .where(eq(schema.adapterAttempts.actionRequestId, input.actionRequestId));
    const attempt: AdapterAttempt = {
      id: createId("adapter-attempt"),
      ...input,
      attemptNumber: Number(count) + 1,
      createdAt: new Date().toISOString()
    };

    await this.db.insert(schema.adapterAttempts).values({
      ...attempt,
      createdAt: new Date(attempt.createdAt)
    });

    return attempt;
  }

  async listAdapterAttemptsByActionRequest(actionRequestId: string) {
    const rows = await this.db
      .select()
      .from(schema.adapterAttempts)
      .where(eq(schema.adapterAttempts.actionRequestId, actionRequestId))
      .orderBy(schema.adapterAttempts.createdAt);
    return rows.map((row) => ({
      ...row,
      failureMode: row.failureMode as AdapterAttempt["failureMode"],
      status: row.status as AdapterAttempt["status"],
      requestPayload: row.requestPayload as Record<string, unknown>,
      responsePayload: row.responsePayload as Record<string, unknown>,
      createdAt: asIsoString(row.createdAt)
    }));
  }

  async listActionRequests() {
    const rows = await this.db.select().from(schema.actionRequests).orderBy(desc(schema.actionRequests.createdAt));
    return rows.map((row) => ({
      ...row,
      actionName: row.actionName as ActionRequest["actionName"],
      lifecycleState: row.lifecycleState as ActionRequest["lifecycleState"],
      policyDecision: row.policyDecision as ActionRequest["policyDecision"],
      resultPayload: (row.resultPayload as Record<string, unknown> | null) ?? null,
      createdAt: asIsoString(row.createdAt),
      updatedAt: asIsoString(row.updatedAt)
    }));
  }

  async saveFollowup(input: { orgId: string; interactionId: string; message: string }) {
    const followup: MessageFollowup = {
      id: createId("followup"),
      orgId: input.orgId,
      interactionId: input.interactionId,
      channel: "sms",
      message: input.message,
      createdAt: new Date().toISOString()
    };
    await this.db.insert(schema.messageFollowups).values({
      ...followup,
      createdAt: new Date(followup.createdAt)
    });
    return followup;
  }

  async createInteraction(input: InteractionInput) {
    await this.db.insert(schema.voiceInteractions).values({
      id: input.interactionId,
      orgId: input.orgId,
      siteId: input.siteId,
      callerPhone: input.callerPhone,
      callerId: input.callerId,
      transcript: input.transcript,
      intent: input.intent,
      extractedFields: input.extractedFields,
      actionAttempted: input.actionAttempted,
      policyDecision: input.policyDecision,
      outcome: input.outcome,
      createdAt: new Date()
    }).onConflictDoUpdate({
      target: schema.voiceInteractions.id,
      set: {
        orgId: input.orgId,
        siteId: input.siteId,
        callerPhone: input.callerPhone,
        callerId: input.callerId,
        transcript: input.transcript,
        intent: input.intent,
        extractedFields: input.extractedFields,
        actionAttempted: input.actionAttempted,
        policyDecision: input.policyDecision,
        outcome: input.outcome
      }
    });
  }

  async createActionLog(input: ActionLogInput) {
    await this.db.insert(schema.voiceActionLogs).values({
      id: createId("action-log"),
      orgId: input.orgId,
      interactionId: input.interactionId,
      actionName: input.actionName,
      requestPayload: input.requestPayload,
      responsePayload: input.responsePayload,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      createdAt: new Date()
    });
  }

  async createWebhookEvent(input: WebhookEventInput) {
    await this.db.insert(schema.webhookEvents).values({
      id: createId("webhook"),
      orgId: input.orgId,
      interactionId: input.interactionId,
      actionName: input.actionName,
      requestBody: input.requestBody,
      responseBody: input.responseBody,
      createdAt: new Date()
    });
  }

  async createGuardrailEvents(input: {
    orgId: string;
    interactionId: string;
    guardrails: Array<{ code: GuardrailEvent["code"]; reason: string }>;
  }) {
    if (input.guardrails.length === 0) {
      return;
    }

    await this.db.insert(schema.guardrailEvents).values(
      input.guardrails.map((guardrail) => ({
        id: createId("guardrail"),
        orgId: input.orgId,
        interactionId: input.interactionId,
        code: guardrail.code,
        reason: guardrail.reason,
        createdAt: new Date()
      }))
    );
  }

  async listInteractions() {
    const rows = await this.db.select().from(schema.voiceInteractions).orderBy(desc(schema.voiceInteractions.createdAt));
    return rows.map((item) => ({
      ...item,
      createdAt: asIsoString(item.createdAt)
    }));
  }

  async getInteractionById(id: string) {
    const row =
      (
        await this.db
          .select()
          .from(schema.voiceInteractions)
          .where(eq(schema.voiceInteractions.id, id))
          .limit(1)
      )[0] ?? null;
    return row ? { ...row, createdAt: asIsoString(row.createdAt) } : null;
  }

  async listActionLogsByInteraction(interactionId: string) {
    const rows = await this.db
      .select()
      .from(schema.voiceActionLogs)
      .where(eq(schema.voiceActionLogs.interactionId, interactionId))
      .orderBy(schema.voiceActionLogs.createdAt);
    return rows.map((item) => ({ ...item, createdAt: asIsoString(item.createdAt) }));
  }

  async listWebhookEventsByInteraction(interactionId: string) {
    const rows = await this.db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.interactionId, interactionId))
      .orderBy(schema.webhookEvents.createdAt);
    return rows.map((item) => ({ ...item, createdAt: asIsoString(item.createdAt) }));
  }

  async listGuardrailsByInteraction(interactionId: string) {
    const rows = await this.db
      .select()
      .from(schema.guardrailEvents)
      .where(eq(schema.guardrailEvents.interactionId, interactionId))
      .orderBy(schema.guardrailEvents.createdAt);
    return rows.map((item) => ({ ...item, createdAt: asIsoString(item.createdAt) }));
  }

  async getFollowupByInteraction(interactionId: string) {
    const row =
      (
        await this.db
          .select()
          .from(schema.messageFollowups)
          .where(eq(schema.messageFollowups.interactionId, interactionId))
          .orderBy(desc(schema.messageFollowups.createdAt))
          .limit(1)
      )[0] ?? null;
    return row ? { ...row, createdAt: asIsoString(row.createdAt) } : null;
  }

  async listRequisitions() {
    const rows = await this.db.select().from(schema.requisitions);
    return rows.map((item) => ({ ...item, totalCost: asNumber(item.totalCost) }));
  }

  async listRequisitionsByInteraction(interactionId: string) {
    const rows = await this.db
      .select()
      .from(schema.requisitions)
      .where(eq(schema.requisitions.interactionId, interactionId));
    return rows.map((item) => ({ ...item, totalCost: asNumber(item.totalCost) }));
  }

  async listApprovalRequests() {
    return this.db.select().from(schema.approvalRequests);
  }

  async listApprovalRequestsByInteraction(interactionId: string) {
    return this.db
      .select()
      .from(schema.approvalRequests)
      .where(eq(schema.approvalRequests.interactionId, interactionId));
  }

  async listSiteIssuesByInteraction(interactionId: string) {
    return this.db
      .select()
      .from(schema.siteIssues)
      .where(eq(schema.siteIssues.interactionId, interactionId));
  }

  async getLatestEvalRun() {
    const row = (
      await this.db.select().from(schema.evalRuns).orderBy(desc(schema.evalRuns.completedAt)).limit(1)
    )[0] ?? null;
    return row
      ? {
          ...row,
          startedAt: asIsoString(row.startedAt),
          completedAt: asIsoString(row.completedAt),
          failCount: row.failCount,
          intentAccuracy: asNumber(row.intentAccuracy),
          fieldExtractionAccuracy: asNumber(row.fieldExtractionAccuracy),
          actionAccuracy: asNumber(row.actionAccuracy),
          guardrailAccuracy: asNumber(row.guardrailAccuracy),
          unsafeActionRate: asNumber(row.unsafeActionRate),
          unsafeActionCount: row.unsafeActionCount,
          clarificationAccuracy: asNumber(row.clarificationAccuracy),
          auditCoverage: asNumber(row.auditCoverage),
          policyBypassDefenseRate: asNumber(row.policyBypassDefenseRate),
          financePrivacyPassRate: asNumber(row.financePrivacyPassRate),
          duplicatePreventionPassRate: asNumber(row.duplicatePreventionPassRate),
          createdRequisitionsCount: row.createdRequisitionsCount,
          createdApprovalsCount: row.createdApprovalsCount,
          createdEscalationsCount: row.createdEscalationsCount,
          missingAuditLogCount: row.missingAuditLogCount,
          readinessStatus: row.readinessStatus as EvalRun["readinessStatus"]
        }
      : null;
  }

  async recordEvalRun(input: Omit<EvalRun, "id"> & { results: Array<Omit<EvalScenarioResult, "id" | "evalRunId">> }) {
    const evalRunId = createId("eval-run");
    await this.db.insert(schema.evalRuns).values({
      id: evalRunId,
      startedAt: new Date(input.startedAt),
      completedAt: new Date(input.completedAt),
      failCount: input.failCount,
      intentAccuracy: input.intentAccuracy.toString(),
      fieldExtractionAccuracy: input.fieldExtractionAccuracy.toString(),
      actionAccuracy: input.actionAccuracy.toString(),
      guardrailAccuracy: input.guardrailAccuracy.toString(),
      unsafeActionRate: input.unsafeActionRate.toString(),
      unsafeActionCount: input.unsafeActionCount,
      clarificationAccuracy: input.clarificationAccuracy.toString(),
      auditCoverage: input.auditCoverage.toString(),
      policyBypassDefenseRate: input.policyBypassDefenseRate.toString(),
      financePrivacyPassRate: input.financePrivacyPassRate.toString(),
      duplicatePreventionPassRate: input.duplicatePreventionPassRate.toString(),
      createdRequisitionsCount: input.createdRequisitionsCount,
      createdApprovalsCount: input.createdApprovalsCount,
      createdEscalationsCount: input.createdEscalationsCount,
      missingAuditLogCount: input.missingAuditLogCount,
      readinessStatus: input.readinessStatus
    });

    if (input.results.length > 0) {
      await this.db.insert(schema.evalResults).values(
        input.results.map((result) => ({
          id: createId("eval-result"),
          evalRunId,
          scenarioId: result.scenarioId,
          passed: result.passed,
          notes: result.notes
        }))
      );
    }

    return evalRunId;
  }

  async resetAndSeed() {
    // Last line of defence: every script, test, and route that wipes data goes through here.
    if (process.env.ALLOW_DESTRUCTIVE_DB_RESET !== "1") {
      throw new Error(
        "Refusing to reset a configured Postgres database. This deletes every row in DATABASE_URL; " +
          "use a disposable database and set ALLOW_DESTRUCTIVE_DB_RESET=1 to proceed."
      );
    }

    await this.db.delete(schema.evalResults);
    await this.db.delete(schema.evalRuns);
    await this.db.delete(schema.messageFollowups);
    await this.db.delete(schema.guardrailEvents);
    await this.db.delete(schema.webhookEvents);
    await this.db.delete(schema.voiceActionLogs);
    await this.db.delete(schema.voiceInteractions);
    await this.db.delete(schema.adapterAttempts);
    await this.db.delete(schema.actionRequests);
    await this.db.delete(schema.siteIssues);
    await this.db.delete(schema.approvalRequests);
    await this.db.delete(schema.requisitionLines);
    await this.db.delete(schema.requisitions);
    await this.db.delete(schema.vendorInvoices);
    await this.db.delete(schema.purchaseOrders);
    await this.db.delete(schema.budgets);
    await this.db.delete(schema.siteStock);
    await this.db.delete(schema.vendors);
    await this.db.delete(schema.materials);
    await this.db.delete(schema.userSiteAccess);
    await this.db.delete(schema.phoneIdentities);
    await this.db.delete(schema.sites);
    await this.db.delete(schema.users);
    await this.db.delete(schema.roles);
    await this.db.delete(schema.customerConfigs);
    await this.db.delete(schema.organizations);

    await this.insertIfAny(schema.organizations, seedDatabase.organizations);
    await this.db.insert(schema.customerConfigs).values(
      seedDatabase.customerConfigs.map((item) => ({
        ...item,
        materialApprovalLimit: item.materialApprovalLimit.toString()
      }))
    );
    await this.insertIfAny(schema.roles, seedDatabase.roles);
    await this.insertIfAny(schema.users, seedDatabase.users);
    await this.insertIfAny(schema.sites, seedDatabase.sites);
    await this.insertIfAny(schema.phoneIdentities, seedDatabase.phoneIdentities);
    await this.insertIfAny(schema.userSiteAccess, seedDatabase.userSiteAccess);
    await this.db.insert(schema.materials).values(
      seedDatabase.materials.map((item) => ({ ...item, unitCost: item.unitCost.toString() }))
    );
    await this.insertIfAny(schema.vendors, seedDatabase.vendors);
    await this.insertIfAny(schema.siteStock, seedDatabase.siteStock);
    await this.db.insert(schema.budgets).values(
      seedDatabase.budgets.map((item) => ({
        ...item,
        monthlyLimit: item.monthlyLimit.toString(),
        committedAmount: item.committedAmount.toString()
      }))
    );
    await this.db.insert(schema.purchaseOrders).values(seedDatabase.purchaseOrders);
    await this.db.insert(schema.vendorInvoices).values(
      seedDatabase.vendorInvoices.map((item) => ({ ...item, amount: item.amount.toString() }))
    );
    await this.insertIfAny(
      schema.requisitions,
      seedDatabase.requisitions.map((item) => ({ ...item, totalCost: item.totalCost.toString() }))
    );
    await this.insertIfAny(schema.requisitionLines, seedDatabase.requisitionLines);
    await this.insertIfAny(schema.approvalRequests, seedDatabase.approvalRequests);
    await this.insertIfAny(schema.siteIssues, seedDatabase.siteIssues);
  }
}

export type AppRepository = MemoryRepository | PostgresRepository;

export function getRepository(mode: RepositoryMode = "auto"): AppRepository {
  if (mode === "memory") {
    return new MemoryRepository();
  }

  if ((mode === "postgres" || mode === "auto") && postgresEnabled()) {
    const db = getPostgresDb();
    if (db) {
      return new PostgresRepository(db);
    }
  }

  return new MemoryRepository();
}
