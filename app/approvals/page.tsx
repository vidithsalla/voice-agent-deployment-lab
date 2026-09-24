import { getRepository } from "@/lib/db/repository";
import { ApprovalActions } from "@/components/approval-actions";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

function readObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export default async function ApprovalsPage() {
  const repo = getRepository();
  const requisitions = await repo.listRequisitions();
  const approvalRequests = await repo.listApprovalRequests();
  const actionRequests = await repo.listActionRequests();
  const pendingCount = approvalRequests.filter((item) => item.status === "pending").length;
  const approvalRows = await Promise.all(
    approvalRequests.map(async (item) => {
      const actionRequest = actionRequests.find((request) => request.approvalRequestId === item.id);
      const interaction = actionRequest ? await repo.getInteractionById(actionRequest.interactionId) : null;
      const caller = interaction ? await repo.resolveCallerByPhone(interaction.callerPhone) : null;
      return { item, actionRequest, interaction, caller };
    })
  );

  return (
    <main className="grid" style={{ gap: 20 }}>
      <section className="panel">
        <div className="page-header-row">
          <div>
            <div className="eyebrow">Operator Control</div>
            <h1 className="page-title">Approval Queue</h1>
          </div>
          <StatusBadge value={pendingCount > 0 ? "approval_pending" : "succeeded"} />
        </div>
        <p className="body-copy" style={{ marginTop: 10 }}>
          Over-threshold voice requests wait here until an operator approves or rejects the linked action request.
        </p>
      </section>

      <section className="panel">
        <div className="eyebrow">Approval Routing</div>
        <h2 className="section-title">Pending and resolved approvals</h2>
        <div className="table-wrap">
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Request</th>
              <th>Requester</th>
              <th>Site</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Consequence</th>
              <th>Operator</th>
            </tr>
          </thead>
          <tbody>
            {approvalRequests.length === 0 ? (
              <tr>
                <td colSpan={7}>No approvals yet. Run an over-budget scenario to populate this view.</td>
              </tr>
            ) : (
              approvalRows.map(({ item, actionRequest, interaction, caller }) => {
                const payload = readObject(actionRequest?.resultPayload);
                const fields = readObject(payload?.fields);
                return (
                  <tr key={item.id}>
                    <td className="mono truncate-cell">
                      <div>{item.id}</div>
                      <div className="subtle" style={{ marginTop: 4 }}>{actionRequest?.actionName ?? "material request"}</div>
                    </td>
                    <td>
                      <div>{caller?.name ?? item.requestedByUserId}</div>
                      <div className="subtle" style={{ marginTop: 4 }}>
                        {caller ? caller.role : interaction?.callerPhone ?? "caller unresolved"}
                      </div>
                    </td>
                    <td>{fields?.siteName ? String(fields.siteName) : item.siteId}</td>
                    <td>
                      <StatusBadge value={item.status === "pending" ? "approval_pending" : item.status} />
                      {actionRequest && actionRequest.lifecycleState !== "approval_pending" ? (
                        <div className="subtle" style={{ marginTop: 6 }}>
                          Action is {actionRequest.lifecycleState.replaceAll("_", " ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="truncate-cell">{item.reason}</td>
                    <td className="truncate-cell">
                      Approve creates one requisition with idempotency key{" "}
                      <span className="mono">{actionRequest?.idempotencyKey ?? item.idempotencyKey}</span>.
                    </td>
                    <td>
                      <ApprovalActions approvalId={item.id} disabled={item.status !== "pending"} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel">
        <div className="eyebrow">Created Requisitions</div>
        <h2 className="section-title">Approved or direct write results</h2>
        <div className="table-wrap">
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Site</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {requisitions.length === 0 ? (
              <tr>
                <td colSpan={4}>No requisitions created yet.</td>
              </tr>
            ) : (
              requisitions.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.id}</td>
                  <td>{item.siteId}</td>
                  <td><StatusBadge value={item.status} /></td>
                  <td>${item.totalCost}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
