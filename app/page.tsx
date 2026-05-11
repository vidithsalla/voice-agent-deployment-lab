import Link from "next/link";
import { getRepository } from "@/lib/db/repository";

export default async function HomePage() {
  const repo = getRepository();
  const phoneIdentityCount = await repo.countPhoneIdentities();
  const stats = [
    { label: "Core workflows", value: "5" },
    { label: "Action endpoints", value: "11" },
    { label: "Seeded callers", value: String(phoneIdentityCount) },
    { label: "Policy modes", value: "4" }
  ];

  return (
    <main className="grid" style={{ gap: 24 }}>
      <section className="panel">
        <div className="eyebrow">Deployment-Grade Voice Ops</div>
        <h1 className="hero-title">Voice agents are easy to demo and hard to deploy safely.</h1>
        <p style={{ maxWidth: 780, fontSize: "1.1rem" }}>
          This project focuses on the deployment layer: turning calls into typed backend actions
          only after identity, permissions, policy, budget, duplication, and audit checks pass.
          It does not try to replace Bland or build a voice model.
        </p>
        <div className="cta-row" style={{ marginTop: 24 }}>
          <Link href="/simulator" className="cta">
            Open Simulator
          </Link>
          <Link href="/dashboard" className="cta secondary">
            Review Calls
          </Link>
          <Link href="/evals" className="cta secondary">
            Read Evals
          </Link>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {stats.map((stat) => (
          <div key={stat.label} className="panel">
            <div className="eyebrow">{stat.label}</div>
            <div style={{ fontSize: "2.2rem", marginTop: 10 }}>{stat.value}</div>
          </div>
        ))}
      </section>

      <section className="grid" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="panel">
          <div className="eyebrow">Core Loop</div>
          <pre style={{ fontSize: "1rem", marginBottom: 0 }}>
            {"transcript -> extraction -> caller -> policy -> action -> audit -> eval"}
          </pre>
        </div>
        <div className="panel">
          <div className="eyebrow">Deployment Story</div>
          <div className="grid">
            <span className="pill">Simulator-first, no external APIs required</span>
            <span className="pill">Bland-style webhook compatible</span>
            <span className="pill">RBAC, approvals, idempotency, audit logs</span>
            <span className="pill">Construction ERP workflows</span>
          </div>
        </div>
      </section>
    </main>
  );
}
