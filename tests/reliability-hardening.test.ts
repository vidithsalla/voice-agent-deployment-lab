import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as approveRoute } from "@/app/api/approvals/[id]/approve/route";
import { POST as rejectRoute } from "@/app/api/approvals/[id]/reject/route";
import { POST as reconcileRoute } from "@/app/api/action-requests/[id]/reconcile/route";
import { POST as retryRoute } from "@/app/api/action-requests/[id]/retry/route";
import { POST as checkStockRoute } from "@/app/api/actions/check-stock/route";
import { POST as runScenarioRoute } from "@/app/api/demo/run-scenario/route";
import { POST as seedEvidenceRoute } from "@/app/api/demo/seed-evidence/route";
import { POST as blandWebhookPost } from "@/app/api/bland/webhook/route";
import { approveMaterialRequest } from "@/lib/actions/approvals";
import { runVoiceAction } from "@/lib/actions/action-gateway";
import { reconcileMaterialRequest, retrySafeMaterialRequest } from "@/lib/actions/reconciliation";
import { getRepository } from "@/lib/db/repository";
import * as schema from "@/lib/db/schema";

const CEMENT = "This is Raj from Site A. We need 40 bags of cement tomorrow morning.";
const STEEL = "This is Raj from Site A. We need 7 steel rods by Sunday.";
const RAJ = "+15550000001";
const ANITA = "+15550000002";

function blandBody(callId: string, variables: Record<string, unknown>, customerKey: string | null = "ventra") {
  return {
    call_id: callId,
    caller_phone: RAJ,
    transcript: "material request",
    ...(customerKey === null ? {} : { request_data: { customer_key: customerKey } }),
    variables: { intent: "create_material_request", site_name: "Site A", ...variables }
  };
}

async function callBland(body: unknown) {
  const response = await blandWebhookPost(
    new Request("http://localhost/api/bland/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  return { status: response.status, payload: await response.json() };
}

const cement = { material_name: "cement", quantity: 40, needed_by: "2026-05-09" };
const steel = { material_name: "steel rods", quantity: 7, needed_by: "2026-09-20" };

beforeEach(async () => {
  await getRepository().resetAndSeed();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("idempotency", () => {
  it("same key + same payload replays the existing result without a second mutation", async () => {
    const base = { interactionId: "idem-1", callerPhone: RAJ, transcript: CEMENT, idempotencyKey: "idem-key-1" };
    const first = await runVoiceAction(base);
    const replay = await runVoiceAction(base);

    expect(replay.relatedRecords.requisitionId).toBe(first.relatedRecords.requisitionId);
    expect(replay.data.actionRequest).toMatchObject({ reused: true, lifecycleState: "succeeded" });
    expect(await getRepository().listRequisitions()).toHaveLength(1);
  });

  it("same key + different payload is a conflict: no replay, no execution, handoff", async () => {
    const base = { interactionId: "idem-2", callerPhone: RAJ, idempotencyKey: "idem-key-2" };
    const first = await runVoiceAction({ ...base, transcript: CEMENT });
    const conflict = await runVoiceAction({ ...base, transcript: STEEL });

    expect(conflict.policyDecision).toBe("blocked");
    expect(conflict.ok).toBe(false);
    expect(conflict.guardrails.map((item) => item.code)).toEqual(["idempotency_key_conflict"]);
    expect(conflict.nextStep).toMatchObject({ directive: "handoff_to_human", reasonCode: "IDEMPOTENCY_CONFLICT" });
    expect(conflict.relatedRecords.requisitionId).toBeUndefined();
    expect(conflict.outcome).not.toMatch(/replayed/i);

    const requisitions = await getRepository().listRequisitions();
    expect(requisitions.map((item) => item.id)).toEqual([first.relatedRecords.requisitionId]);
    expect(await getRepository().getActionRequestByIdempotency("idem-key-2")).toMatchObject({
      lifecycleState: "succeeded"
    });
  });

  it("concurrent duplicate deliveries produce one requisition", async () => {
    const base = { interactionId: "idem-3", callerPhone: RAJ, transcript: CEMENT, idempotencyKey: "idem-key-3" };
    const results = await Promise.all([runVoiceAction(base), runVoiceAction(base), runVoiceAction(base)]);

    expect(await getRepository().listRequisitions()).toHaveLength(1);
    expect(new Set(results.map((item) => item.relatedRecords.requisitionId)).size).toBe(1);
  });

  it("Bland: one call can carry two different actions; identical redelivery replays", async () => {
    const first = await callBland(blandBody("call-multi-1", cement));
    const second = await callBland(blandBody("call-multi-1", steel));
    const redelivery = await callBland(blandBody("call-multi-1", cement));

    expect(first.payload.next_step.directive).toBe("continue");
    expect(second.payload.next_step.directive).toBe("continue");
    expect(second.payload.speak).not.toMatch(/replayed/i);
    expect(second.payload.next_step.action_request_id).not.toBe(first.payload.next_step.action_request_id);
    expect(redelivery.payload.next_step.action_request_id).toBe(first.payload.next_step.action_request_id);
    expect(await getRepository().listRequisitions()).toHaveLength(2);
  });

  it("idempotency keys are unique in the Postgres schema for every write table", () => {
    for (const table of [schema.requisitions, schema.approvalRequests, schema.siteIssues, schema.actionRequests]) {
      const { indexes } = getTableConfig(table);
      const covered = indexes.some(
        (index) =>
          index.config.unique &&
          index.config.columns.length === 1 &&
          index.config.columns.some((column) => "name" in column && column.name === "idempotency_key")
      );
      expect(covered).toBe(true);
    }
  });
});

describe("tenant resolution fails closed", () => {
  it("a supplied unknown customer key cannot mutate and never falls back to another tenant", async () => {
    const { status, payload } = await callBland(blandBody("tenant-unknown", cement, "does-not-exist"));

    expect(status).toBe(200);
    expect(payload.status).toBe("blocked");
    expect(payload.guardrails).toEqual(["unknown_customer"]);
    expect(payload.next_step).toMatchObject({ directive: "handoff_to_human", reason_code: "UNKNOWN_CUSTOMER" });
    expect(await getRepository().listRequisitions()).toHaveLength(0);
    expect(await getRepository().listActionRequests()).toHaveLength(0);
  });

  it("the Bland webhook requires a customer key", async () => {
    const { payload } = await callBland(blandBody("tenant-missing", cement, null));

    expect(payload.next_step.reason_code).toBe("UNKNOWN_CUSTOMER");
    expect(await getRepository().listRequisitions()).toHaveLength(0);
  });

  it("gateway callers cannot fall back either: unknown key, blank key, non-string key", async () => {
    for (const customerConfigKey of ["nope", "  "]) {
      const result = await runVoiceAction({
        interactionId: `tenant-${customerConfigKey.trim() || "blank"}`,
        callerPhone: RAJ,
        transcript: CEMENT,
        customerConfigKey
      });
      expect(result.guardrails.map((item) => item.code)).toEqual(["unknown_customer"]);
    }
    const nonString = await runVoiceAction({
      interactionId: "tenant-number",
      callerPhone: RAJ,
      transcript: CEMENT,
      sourceMetadata: { customer_key: 42 }
    });
    expect(nonString.guardrails.map((item) => item.code)).toEqual(["unknown_customer"]);
    expect(await getRepository().listRequisitions()).toHaveLength(0);
  });

  it("known tenants apply their own policy: same caller and request, different outcome", async () => {
    const steelRequest = {
      callerPhone: ANITA,
      transcript: "This is Anita. We need 10 steel rods at Site A by Sunday.",
      overrideIntent: "create_material_request" as const,
      overrideFields: { siteName: "Site A", materialName: "steel rods", quantity: 10, neededBy: "2026-09-20" }
    };
    const ventra = await runVoiceAction({ ...steelRequest, interactionId: "tenant-v", customerConfigKey: "ventra" });
    await getRepository().resetAndSeed(); // otherwise the identical second request is a business duplicate
    const northstar = await runVoiceAction({ ...steelRequest, interactionId: "tenant-n", customerConfigKey: "northstar" });
    const siteManagerNorthstar = await runVoiceAction({
      interactionId: "tenant-n2",
      callerPhone: RAJ,
      transcript: CEMENT,
      customerConfigKey: "northstar"
    });

    expect(ventra.policyDecision).toBe("allowed");
    expect(ventra.data.customerConfig).toMatchObject({ key: "ventra" });
    expect(northstar.policyDecision).toBe("approval_required");
    expect(northstar.data.customerConfig).toMatchObject({ key: "northstar" });
    expect(siteManagerNorthstar.policyDecision).toBe("blocked");
  });
});

describe("reconciliation outcome comes from a downstream lookup", () => {
  async function lostResponse(key: string) {
    const run = await runVoiceAction({
      interactionId: key,
      callerPhone: RAJ,
      transcript: CEMENT,
      idempotencyKey: key,
      sourceMetadata: { failureMode: "mutated_response_lost" }
    });
    return run.relatedRecords.actionRequestId ?? "";
  }

  async function failedBeforeMutation(key: string) {
    const run = await runVoiceAction({
      interactionId: key,
      callerPhone: RAJ,
      transcript: CEMENT,
      idempotencyKey: key,
      sourceMetadata: { failureMode: "timeout_before_mutation" }
    });
    return run.relatedRecords.actionRequestId ?? "";
  }

  it("a caller cannot force the outcome through the route body", async () => {
    vi.stubEnv("OPERATOR_API_SECRET", "op-secret");
    const actionRequestId = await lostResponse("recon-force-1");
    const response = await reconcileRoute(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-operator-secret": "op-secret" },
        body: JSON.stringify({ outcome: "not_found" })
      }),
      { params: Promise.resolve({ id: actionRequestId }) }
    );
    const payload = await response.json();

    expect(payload.actionRequest.lifecycleState).toBe("recovered");
    expect(payload.nextStep.directive).toBe("continue");
    expect(await getRepository().listRequisitions()).toHaveLength(1);
  });

  it("mutation exists -> found -> recovered, without a second write", async () => {
    const id = await lostResponse("recon-found-1");
    const result = await reconcileMaterialRequest({ actionRequestId: id, operatorUserId: "t" });

    expect(result.actionRequest).toMatchObject({ lifecycleState: "recovered" });
    expect(await getRepository().listRequisitions()).toHaveLength(1);
    const attempts = await getRepository().listAdapterAttemptsByActionRequest(id);
    expect(attempts.map((item) => item.status)).toContain("reconciliation_found");
  });

  it("no mutation -> not_found -> retry allowed -> exactly one write", async () => {
    const id = await failedBeforeMutation("recon-missing-1");
    const reconciled = await reconcileMaterialRequest({ actionRequestId: id, operatorUserId: "t" });
    expect(reconciled.actionRequest).toMatchObject({ lifecycleState: "failed_retryable" });
    expect((await getRepository().listAdapterAttemptsByActionRequest(id)).map((a) => a.status)).toContain(
      "reconciliation_missing"
    );

    const retried = await retrySafeMaterialRequest({ actionRequestId: id, operatorUserId: "t" });
    expect(retried.ok).toBe(true);
    expect(await getRepository().listRequisitions()).toHaveLength(1);
  });

  it("unavailable downstream -> human review, and neither reconcile nor retry can proceed to a write", async () => {
    const id = await lostResponse("recon-unknown-1");
    const unresolved = await reconcileMaterialRequest({ actionRequestId: id, operatorUserId: "t" }, async () => ({
      status: "unavailable"
    }));
    expect(unresolved.actionRequest).toMatchObject({ lifecycleState: "human_review_required" });
    expect(unresolved.nextStep?.directive).toBe("handoff_to_human");

    expect(await retrySafeMaterialRequest({ actionRequestId: id, operatorUserId: "t" })).toMatchObject({
      ok: false,
      error: "invalid_retry_state"
    });
    expect(await getRepository().listRequisitions()).toHaveLength(1);
  });

  it("retry re-checks downstream: a mutation that appeared after the failure is recovered, not duplicated", async () => {
    const id = await failedBeforeMutation("recon-late-1");
    await getRepository().createRequisition({
      interactionId: "recon-late-1",
      callerUserId: "user-raj",
      siteName: "Site A",
      materialName: "cement",
      quantity: 40,
      neededBy: "2026-05-09",
      idempotencyKey: "recon-late-1"
    });

    const retried = await retrySafeMaterialRequest({ actionRequestId: id, operatorUserId: "t" });
    expect(retried.actionRequest).toMatchObject({ lifecycleState: "recovered" });
    expect(await getRepository().listRequisitions()).toHaveLength(1);
  });

  it("retry with an unavailable downstream does not write", async () => {
    const id = await failedBeforeMutation("recon-late-2");
    const retried = await retrySafeMaterialRequest({ actionRequestId: id, operatorUserId: "t" }, async () => ({
      status: "unavailable"
    }));
    expect(retried.actionRequest).toMatchObject({ lifecycleState: "human_review_required" });
    expect(await getRepository().listRequisitions()).toHaveLength(0);
  });

  it("the Bland webhook cannot inject a failure mode", async () => {
    const body = blandBody("no-injection-1", cement);
    const { payload } = await callBland({ ...body, request_data: { customer_key: "ventra", failure_mode: "mutated_response_lost" } });

    expect(payload.next_step.directive).toBe("continue");
    expect(await getRepository().listRequisitions()).toHaveLength(1);
  });
});

describe("approval state machine", () => {
  async function pendingApproval(key: string) {
    const run = await runVoiceAction({
      interactionId: key,
      callerPhone: ANITA,
      transcript: "over budget",
      overrideIntent: "create_material_request",
      overrideFields: { siteName: "Site B", materialName: "steel rods", quantity: 5, neededBy: "2026-09-20" },
      idempotencyKey: key
    });
    return {
      approvalId: run.relatedRecords.approvalRequestId ?? "",
      actionRequestId: run.relatedRecords.actionRequestId ?? "",
      run
    };
  }

  it("concurrent approvals execute once", async () => {
    const { approvalId, run } = await pendingApproval("approval-race-1");
    expect(run.policyDecision).toBe("approval_required");

    const results = await Promise.all([
      approveMaterialRequest({ approvalRequestId: approvalId, operatorUserId: "a" }),
      approveMaterialRequest({ approvalRequestId: approvalId, operatorUserId: "b" })
    ]);

    expect(results.filter((item) => item.ok && !("replayed" in item && item.replayed))).toHaveLength(1);
    expect(await getRepository().listRequisitions()).toHaveLength(1);
  });

  it("the state transition is compare-and-set: only one of two racing claims wins", async () => {
    const { actionRequestId } = await pendingApproval("approval-cas-1");
    const repo = getRepository();
    const claims = await Promise.all([
      repo.transitionActionRequest(actionRequestId, ["approval_pending"], { lifecycleState: "executing" }),
      repo.transitionActionRequest(actionRequestId, ["approval_pending"], { lifecycleState: "rejected" })
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims[0]).not.toBeNull();
    expect((await repo.getActionRequestById(actionRequestId))?.lifecycleState).toBe("executing");
  });

  it("approve from a non-pending state is rejected without executing", async () => {
    const { approvalId, actionRequestId } = await pendingApproval("approval-state-1");
    await getRepository().updateActionRequest(actionRequestId, { lifecycleState: "failed_terminal" });

    const result = await approveMaterialRequest({ approvalRequestId: approvalId, operatorUserId: "a" });

    expect(result).toMatchObject({ ok: false, error: "approval_not_pending" });
    expect(await getRepository().listRequisitions()).toHaveLength(0);
  });
});

describe("operator and demo route protection", () => {
  const params = { params: Promise.resolve({ id: "does-not-exist" }) };
  const post = (headers: Record<string, string> = {}, body: unknown = {}) =>
    new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    });
  const stockBody = { callerPhone: RAJ, transcript: "stock", siteName: "Site A", materialName: "cement" };
  const routes: Array<[string, (request: Request) => Promise<Response>, unknown]> = [
    ["approve", (r) => approveRoute(r, params), {}],
    ["reject", (r) => rejectRoute(r, params), {}],
    ["reconcile", (r) => reconcileRoute(r, params), {}],
    ["retry", (r) => retryRoute(r, params), {}],
    ["run-scenario", runScenarioRoute, { transcript: CEMENT, callerPhone: RAJ, idempotencyKey: "k" }],
    ["seed-evidence", seedEvidenceRoute, {}],
    ["legacy check-stock", checkStockRoute, stockBody]
  ];

  it.each(routes)("%s: missing or wrong secret is rejected when a secret is configured", async (_name, handler, body) => {
    vi.stubEnv("OPERATOR_API_SECRET", "op-secret");
    expect((await handler(post({}, body))).status).toBe(401);
    expect((await handler(post({ "x-operator-secret": "wrong" }, body))).status).toBe(401);
    expect((await handler(post({ authorization: "Bearer op-secret" }, body))).status).toBe(401);
  });

  it.each(routes)("%s: closed in production when no secret is configured", async (_name, handler, body) => {
    vi.stubEnv("OPERATOR_API_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect((await handler(post({}, body))).status).toBe(403);
  });

  it.each(routes)("%s: reaches the handler with the correct secret", async (_name, handler, body) => {
    vi.stubEnv("OPERATOR_API_SECRET", "op-secret");
    const response = await handler(post({ "x-operator-secret": "op-secret" }, body));
    expect([401, 403]).not.toContain(response.status);
  });

  it("an authorized approval records the synthetic operator identity, not a fabricated user", async () => {
    vi.stubEnv("OPERATOR_API_SECRET", "op-secret");
    const run = await runVoiceAction({
      interactionId: "route-approve-1",
      callerPhone: ANITA,
      transcript: "over budget",
      overrideIntent: "create_material_request",
      overrideFields: { siteName: "Site B", materialName: "steel rods", quantity: 5, neededBy: "2026-09-20" },
      idempotencyKey: "route-approve-1"
    });
    const response = await approveRoute(post({ "x-operator-secret": "op-secret" }), {
      params: Promise.resolve({ id: run.relatedRecords.approvalRequestId ?? "" })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.actionRequest.resultPayload.approvedBy).toBe("demo_operator");
  });
});

describe("destructive reset guard", () => {
  it("refuses to wipe a configured Postgres database without explicit opt-in", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@127.0.0.1:1/never_connected");
    vi.stubEnv("ALLOW_DESTRUCTIVE_DB_RESET", "");
    await expect(getRepository("postgres").resetAndSeed()).rejects.toThrow(/Refusing to reset/);
  });

  it("in-memory reset stays allowed", async () => {
    await expect(getRepository("memory").resetAndSeed()).resolves.not.toThrow();
  });
});
