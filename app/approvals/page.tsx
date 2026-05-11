import { getRepository } from "@/lib/db/repository";

export default async function ApprovalsPage() {
  const repo = getRepository();
  const requisitions = await repo.listRequisitions();
  const approvalRequests = await repo.listApprovalRequests();

  return (
    <main className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <section className="panel">
        <div className="eyebrow">Requisitions</div>
        <h1>Created Requisitions</h1>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Site</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {requisitions.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.siteId}</td>
                <td>{item.status}</td>
                <td>${item.totalCost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <div className="eyebrow">Approval Routing</div>
        <h2>Approval Requests</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Site</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {approvalRequests.length === 0 ? (
              <tr>
                <td colSpan={4}>No approvals yet. Run an over-budget scenario to populate this view.</td>
              </tr>
            ) : (
              approvalRequests.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.siteId}</td>
                  <td>{item.status}</td>
                  <td>{item.reason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
