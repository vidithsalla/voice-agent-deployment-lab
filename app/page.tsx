import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { getRepository } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const repo = getRepository();
  const phoneIdentityCount = await repo.countPhoneIdentities();
  const customerConfigs = await repo.listCustomerConfigs();
  const stats = [
    { label: "Core workflows", value: "5" },
    { label: "Action endpoints", value: "13" },
    { label: "Seeded callers", value: String(phoneIdentityCount) },
    { label: "Customer configs", value: String(customerConfigs.length) }
  ];

  return (
    <main className="grid" style={{ gap: 24 }}>
      <section className="panel page-header">
        <div className="page-header-row">
          <div>
            <div className="eyebrow">Deployment Gateway</div>
            <h1 className="hero-title">Control plane for voice-triggered business actions.</h1>
          </div>
          <StatusBadge value="prepared" />
        </div>
        <p className="body-copy" style={{ fontSize: "1rem" }}>
          Bland owns the conversation. This project owns the deployment boundary: turning calls
          into typed backend actions only after identity, permissions, tenant policy, approval,
          idempotency, adapter execution, recovery, and audit checks pass.
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
          <div key={stat.label} className="metric">
            <div className="eyebrow">{stat.label}</div>
            <div className="metric-value">{stat.value}</div>
          </div>
        ))}
      </section>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="panel">
          <div className="eyebrow">Action Boundary</div>
          <h2 className="section-title">Bland request to system-of-record side effect</h2>
          <pre className="mono" style={{ fontSize: "0.95rem", marginBottom: 0 }}>
            {"Bland call -> normalized action -> identity -> tenant policy -> idempotency -> adapter -> audit"}
          </pre>
        </div>
        <div className="panel">
          <div className="eyebrow">Current Evidence</div>
          <div className="grid">
            <span className="pill">50 deterministic policy/action scenarios</span>
            <span className="pill">Prepared for current Bland Pathways webhooks/tools</span>
            <span className="pill">Tenant policy, approvals, idempotency, recovery</span>
            <span className="pill">Bland Webhook node verified once; phone calls not tested</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="eyebrow">Customer Configuration</div>
        <h2>One gateway, different deployment rules</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {customerConfigs.map((config) => (
            <div className="detail-card" key={config.key}>
              <strong>{config.name}</strong>
              <div className="detail-list" style={{ marginTop: 12 }}>
                <div className="detail-row">
                  <span className="subtle">Key</span>
                  <span>{config.key}</span>
                </div>
                <div className="detail-row">
                  <span className="subtle">Policy</span>
                  <span>{config.policyVersion}</span>
                </div>
                <div className="detail-row">
                  <span className="subtle">Approval limit</span>
                  <span>${config.materialApprovalLimit}</span>
                </div>
                <div className="detail-row">
                  <span className="subtle">Sites</span>
                  <span>{config.allowedSiteIds.join(", ")}</span>
                </div>
                <div className="detail-row">
                  <span className="subtle">Finance roles</span>
                  <span>{config.financeVisibleRoles.length > 0 ? config.financeVisibleRoles.join(", ") : "none"}</span>
                </div>
                <div className="detail-row">
                  <span className="subtle">Creation roles</span>
                  <span>
                    {Object.entries(config.rolePermissions)
                      .filter(([, actions]) => actions.includes("create_material_request"))
                      .map(([role]) => role)
                      .join(", ") || "none"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
