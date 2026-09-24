import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { getRepository } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repo = getRepository();
  const interactions = await repo.listInteractions();
  const actionRequests = await repo.listActionRequests();
  const pendingApprovals = actionRequests.filter((item) => item.lifecycleState === "approval_pending").length;
  const failedOrRecoverable = actionRequests.filter((item) =>
    item.lifecycleState === "failed_retryable" || item.lifecycleState === "failed_terminal"
  ).length;
  const succeededOrRecovered = actionRequests.filter((item) =>
    item.lifecycleState === "succeeded" || item.lifecycleState === "recovered"
  ).length;
  const callers = await Promise.all(
    interactions.map(async (interaction) => ({
      interactionId: interaction.id,
      caller: await repo.resolveCallerByPhone(interaction.callerPhone)
    }))
  );
  const callerMap = new Map(callers.map((item) => [item.interactionId, item.caller]));

  return (
    <main className="grid" style={{ gap: 20 }}>
      <section className="panel">
        <div className="page-header">
          <div className="page-header-row">
            <div>
              <div className="eyebrow">Deployment Gateway</div>
              <h1 className="page-title">Operations Dashboard</h1>
            </div>
            <StatusBadge value="prepared" />
          </div>
          <p className="body-copy">
            Current local environment: seeded demo data, memory persistence unless `DATABASE_URL` is set,
            Bland live verification prepared but not completed.
          </p>
        </div>
      </section>

      <section className="metric-grid">
        <div className="metric">
          <div className="eyebrow">Recent calls</div>
          <div className="metric-value">{interactions.length}</div>
        </div>
        <div className="metric">
          <div className="eyebrow">Succeeded or recovered</div>
          <div className="metric-value">{succeededOrRecovered}</div>
        </div>
        <div className="metric">
          <div className="eyebrow">Operator attention</div>
          <div className="metric-value">{pendingApprovals}</div>
        </div>
        <div className="metric">
          <div className="eyebrow">Failures open</div>
          <div className="metric-value">{failedOrRecoverable}</div>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar-row">
          <div>
            <div className="eyebrow">Action Requests</div>
            <h2 className="section-title">Lifecycle and idempotency</h2>
          </div>
          <Link href="/approvals" className="cta secondary">Approval queue</Link>
        </div>
        <div className="table-wrap">
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Action</th>
              <th>Customer</th>
              <th>Lifecycle</th>
              <th>Policy</th>
              <th>Idempotency</th>
            </tr>
          </thead>
          <tbody>
            {actionRequests.length === 0 ? (
              <tr>
                <td colSpan={5}>No action requests yet. Run a simulator scenario to populate this view.</td>
              </tr>
            ) : (
              actionRequests.map((request) => (
                <tr key={request.id}>
                  <td>{request.actionName}</td>
                  <td>{request.customerConfigKey}</td>
                  <td>
                    <StatusBadge value={request.lifecycleState} />
                  </td>
                  <td><StatusBadge value={request.policyDecision} /></td>
                  <td className="truncate-cell mono">
                    <div>{request.idempotencyKey}</div>
                    <div className="subtle" style={{ marginTop: 4, fontSize: "0.85rem" }}>
                      {request.id}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel">
      <div className="eyebrow">Recent Voice Interactions</div>
      <h2 className="section-title">Calls</h2>
      <div className="table-wrap">
      <table className="table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Caller</th>
            <th>Intent</th>
            <th>Outcome</th>
            <th>Time</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {interactions.length === 0 ? (
            <tr>
              <td colSpan={5}>No interactions yet. Run a simulator scenario to populate the dashboard.</td>
            </tr>
          ) : (
            interactions.map((interaction) => (
              <tr key={interaction.id}>
                <td>
                  <div>{callerMap.get(interaction.id)?.name ?? interaction.callerId ?? interaction.callerPhone}</div>
                  {callerMap.get(interaction.id)?.role ? (
                    <div className="subtle" style={{ marginTop: 4, fontSize: "0.9rem" }}>
                      {callerMap.get(interaction.id)?.role}
                    </div>
                  ) : null}
                </td>
                <td>
                  <StatusBadge value={interaction.policyDecision} />
                  <div style={{ marginTop: 8 }}>{interaction.intent}</div>
                </td>
                <td className="truncate-cell">{interaction.outcome}</td>
                <td>{new Date(interaction.createdAt).toLocaleString()}</td>
                <td>
                  <Link href={`/calls/${interaction.id}`}>View trace</Link>
                </td>
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
