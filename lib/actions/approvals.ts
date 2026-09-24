import { getRepository } from "@/lib/db/repository";
import { createActionLog } from "@/lib/actions/audit";
import { createRequisition } from "@/lib/actions/requisitions";
import type { ExtractedFields } from "@/lib/simulator/extraction";

export async function findApprovalByIdempotency(idempotencyKey: string) {
  return getRepository().findApprovalByIdempotency(idempotencyKey);
}

export async function requestApproval(input: {
  interactionId: string;
  callerUserId: string;
  siteName: string;
  reason: string;
  idempotencyKey: string;
}) {
  return getRepository().createApprovalRequest(input);
}

function readFields(value: Record<string, unknown> | null): ExtractedFields | null {
  const fields = value?.fields;
  return fields && typeof fields === "object" ? (fields as ExtractedFields) : null;
}

export async function approveMaterialRequest(input: { approvalRequestId: string; operatorUserId: string }) {
  const repo = getRepository();
  const approval = await repo.getApprovalRequestById(input.approvalRequestId);
  if (!approval) {
    return { ok: false, error: "approval_not_found" as const };
  }

  const actionRequest = await repo.getActionRequestByApprovalId(approval.id);
  if (!actionRequest) {
    return { ok: false, error: "action_request_not_found" as const, approval };
  }

  if (approval.status === "rejected") {
    return { ok: false, error: "approval_already_rejected" as const, approval, actionRequest };
  }

  if (actionRequest.lifecycleState === "succeeded" && actionRequest.resultPayload?.requisitionId) {
    return {
      ok: true,
      replayed: true,
      approval,
      actionRequest,
      requisitionId: String(actionRequest.resultPayload.requisitionId)
    };
  }

  if (actionRequest.lifecycleState !== "approval_pending") {
    return {
      ok: false,
      error: (actionRequest.lifecycleState === "executing" ? "approval_in_progress" : "approval_not_pending") as
        | "approval_in_progress"
        | "approval_not_pending",
      approval,
      actionRequest
    };
  }

  const fields = readFields(actionRequest.resultPayload);
  if (!fields) {
    await repo.transitionActionRequest(actionRequest.id, ["approval_pending"], {
      lifecycleState: "failed_terminal",
      errorCode: "approval_payload_missing",
      resultPayload: { outcome: "Approval cannot execute because the original normalized payload is missing." }
    });
    return { ok: false, error: "approval_payload_missing" as const, approval, actionRequest };
  }

  // Compare-and-set: only one concurrent approve can move approval_pending -> executing.
  const claimed = await repo.transitionActionRequest(actionRequest.id, ["approval_pending"], {
    lifecycleState: "executing"
  });
  if (!claimed) {
    const current = (await repo.getActionRequestById(actionRequest.id)) ?? actionRequest;
    if (current.lifecycleState === "succeeded" && current.resultPayload?.requisitionId) {
      return {
        ok: true,
        replayed: true,
        approval,
        actionRequest: current,
        requisitionId: String(current.resultPayload.requisitionId)
      };
    }
    return {
      ok: false,
      error: (current.lifecycleState === "executing" ? "approval_in_progress" : "approval_not_pending") as
        | "approval_in_progress"
        | "approval_not_pending",
      approval,
      actionRequest: current
    };
  }

  await repo.updateApprovalRequestStatus(approval.id, "approved");

  const requisition = await createRequisition({
    interactionId: actionRequest.interactionId,
    callerUserId: typeof actionRequest.resultPayload?.callerUserId === "string"
      ? actionRequest.resultPayload.callerUserId
      : approval.requestedByUserId,
    siteName: fields.siteName ?? "",
    materialName: fields.materialName ?? "",
    quantity: fields.quantity ?? 0,
    neededBy: fields.neededBy ?? "",
    idempotencyKey: actionRequest.idempotencyKey
  });

  if (!requisition) {
    await repo.recordAdapterAttempt({
      orgId: approval.orgId,
      actionRequestId: actionRequest.id,
      adapterName: "mock_erp",
      failureMode: "terminal_validation_failure",
      status: "failed_terminal",
      requestPayload: { approvalRequestId: approval.id, operatorUserId: input.operatorUserId, fields },
      responsePayload: { mutationConfirmed: false, outcome: "Approved request could not create requisition." }
    });
    await repo.updateActionRequest(actionRequest.id, {
      lifecycleState: "failed_terminal",
      errorCode: "approved_requisition_not_created",
      resultPayload: { outcome: "Approved request could not create requisition." }
    });
    return { ok: false, error: "approved_requisition_not_created" as const, approval, actionRequest };
  }

  await repo.recordAdapterAttempt({
    orgId: approval.orgId,
    actionRequestId: actionRequest.id,
    adapterName: "mock_erp",
    failureMode: "none",
    status: "succeeded",
    requestPayload: { approvalRequestId: approval.id, operatorUserId: input.operatorUserId, fields },
    responsePayload: { mutationConfirmed: true, requisitionId: requisition.id }
  });
  const outcome = `Approved and created requisition ${requisition.id}.`;
  const updatedActionRequest = await repo.updateActionRequest(actionRequest.id, {
    lifecycleState: "succeeded",
    policyDecision: "allowed",
    resultPayload: { requisitionId: requisition.id, outcome, approvedBy: input.operatorUserId },
    errorCode: null
  });
  await createActionLog({
    orgId: approval.orgId,
    interactionId: actionRequest.interactionId,
    actionName: "operator_approval_approved",
    requestPayload: { approvalRequestId: approval.id, operatorUserId: input.operatorUserId },
    responsePayload: { requisitionId: requisition.id, outcome, policyImplication: "approval_satisfied" }
  });

  return { ok: true, replayed: false, approval, actionRequest: updatedActionRequest ?? actionRequest, requisition };
}

export async function rejectMaterialRequest(input: { approvalRequestId: string; operatorUserId: string }) {
  const repo = getRepository();
  const approval = await repo.getApprovalRequestById(input.approvalRequestId);
  if (!approval) {
    return { ok: false, error: "approval_not_found" as const };
  }

  const actionRequest = await repo.getActionRequestByApprovalId(approval.id);
  if (approval.status === "approved" || actionRequest?.lifecycleState === "succeeded") {
    return { ok: false, error: "approval_already_executed" as const, approval, actionRequest };
  }

  if (approval.status === "rejected" || actionRequest?.lifecycleState === "rejected") {
    return { ok: true, replayed: true, approval, actionRequest };
  }

  if (actionRequest) {
    const rejected = await repo.transitionActionRequest(actionRequest.id, ["approval_pending"], {
      lifecycleState: "rejected",
      resultPayload: { outcome: "Operator rejected the approval request.", rejectedBy: input.operatorUserId },
      errorCode: null
    });
    if (!rejected) {
      return { ok: false, error: "approval_not_pending" as const, approval, actionRequest };
    }
  }

  await repo.updateApprovalRequestStatus(approval.id, "rejected");
  if (actionRequest) {
    await createActionLog({
      orgId: approval.orgId,
      interactionId: actionRequest.interactionId,
      actionName: "operator_approval_rejected",
      requestPayload: { approvalRequestId: approval.id, operatorUserId: input.operatorUserId },
      responsePayload: { outcome: "Operator rejected the approval request.", policyImplication: "approval_denied" }
    });
  }

  return { ok: true, approval, actionRequest };
}
