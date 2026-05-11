import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { getPostgresDb, postgresEnabled } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed-data";
import { getDemoDb, resetDemoDb } from "@/lib/db/store";
import type {
  ApprovalRequest,
  CallerContext,
  DemoDatabase,
  EvalRun,
  EvalScenarioResult,
  GuardrailEvent,
  MessageFollowup,
  PurchaseOrder,
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
    this.db().voiceInteractions.push({
      id: input.interactionId,
      ...input,
      createdAt: new Date().toISOString()
    });
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
    return this.db().messageFollowups.find((item) => item.interactionId === interactionId) ?? null;
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

  async countPhoneIdentities() {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)` }).from(schema.phoneIdentities);
    return Number(count);
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
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.requisitions).values({
        id: requisitionId,
        orgId: site.orgId,
        siteId: site.id,
        requestedByUserId: input.callerUserId,
        status: "draft",
        idempotencyKey: input.idempotencyKey,
        interactionId: input.interactionId,
        totalCost: totalCost.toString(),
        neededBy: input.neededBy
      });

      await tx.insert(schema.requisitionLines).values({
        id: createId("req-line"),
        orgId: site.orgId,
        requisitionId,
        materialId: material.id,
        quantity: input.quantity
      });
    });

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

    await this.db.insert(schema.approvalRequests).values(approval);
    return approval;
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
    await this.db.insert(schema.siteIssues).values(issue);
    return issue;
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
    await this.db.delete(schema.evalResults);
    await this.db.delete(schema.evalRuns);
    await this.db.delete(schema.messageFollowups);
    await this.db.delete(schema.guardrailEvents);
    await this.db.delete(schema.webhookEvents);
    await this.db.delete(schema.voiceActionLogs);
    await this.db.delete(schema.voiceInteractions);
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
    await this.db.delete(schema.organizations);

    await this.db.insert(schema.organizations).values(seedDatabase.organizations);
    await this.db.insert(schema.roles).values(seedDatabase.roles);
    await this.db.insert(schema.users).values(seedDatabase.users);
    await this.db.insert(schema.sites).values(seedDatabase.sites);
    await this.db.insert(schema.phoneIdentities).values(seedDatabase.phoneIdentities);
    await this.db.insert(schema.userSiteAccess).values(seedDatabase.userSiteAccess);
    await this.db.insert(schema.materials).values(
      seedDatabase.materials.map((item) => ({ ...item, unitCost: item.unitCost.toString() }))
    );
    await this.db.insert(schema.vendors).values(seedDatabase.vendors);
    await this.db.insert(schema.siteStock).values(seedDatabase.siteStock);
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
    await this.db.insert(schema.requisitions).values(
      seedDatabase.requisitions.map((item) => ({ ...item, totalCost: item.totalCost.toString() }))
    );
    await this.db.insert(schema.requisitionLines).values(seedDatabase.requisitionLines);
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
