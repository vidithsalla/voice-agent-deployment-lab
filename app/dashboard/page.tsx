import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { getRepository } from "@/lib/db/repository";

export default async function DashboardPage() {
  const interactions = await getRepository().listInteractions();

  return (
    <main className="panel">
      <div className="eyebrow">Recent Voice Interactions</div>
      <h1>Calls Dashboard</h1>
      <p className="subtle">Review caller identity, action outcomes, policy decisions, and traceable records.</p>
      <table className="table" style={{ marginTop: 18 }}>
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
                <td>{interaction.callerId ?? interaction.callerPhone}</td>
                <td>
                  <StatusBadge value={interaction.policyDecision} />
                  <div style={{ marginTop: 8 }}>{interaction.intent}</div>
                </td>
                <td>{interaction.outcome}</td>
                <td>{new Date(interaction.createdAt).toLocaleString()}</td>
                <td>
                  <Link href={`/calls/${interaction.id}`}>Open</Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}
