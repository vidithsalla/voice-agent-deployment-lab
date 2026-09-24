import fs from "node:fs";
import path from "node:path";
import { getRepository } from "@/lib/db/repository";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

function readDoc(fileName: string) {
  const filePath = path.join(process.cwd(), "docs", fileName);
  if (!fs.existsSync(filePath)) {
    return "Run `npm run eval` to generate this report.";
  }

  return fs.readFileSync(filePath, "utf8");
}

export default async function EvalsPage() {
  const latestRun = await getRepository().getLatestEvalRun();
  const externalEvidence = readDoc("external-evidence/README.md");

  return (
    <main className="grid" style={{ gap: 20 }}>
      <section className="panel page-header">
        <div className="page-header-row">
          <div>
            <div className="eyebrow">Evidence</div>
            <h1 className="page-title">Deployment Evidence</h1>
          </div>
          {latestRun ? <StatusBadge value={latestRun.readinessStatus} /> : <StatusBadge value="prepared" />}
        </div>
        <p className="body-copy">
          These results are deterministic policy/action regression evidence. They do not claim live
          Bland conversation quality or telephony verification.
        </p>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="panel compact">
          <div className="eyebrow">Layer 1</div>
          <h2 className="section-title">Bland Webhook node</h2>
          <div style={{ marginTop: 10 }}><StatusBadge value="succeeded" /></div>
          <p className="subtle">Verified authenticated Webhook-node execution with Neon-backed persistence.</p>
        </div>
        <div className="panel compact">
          <div className="eyebrow">Layer 2</div>
          <h2 className="section-title">Policy/action regression</h2>
          <div style={{ marginTop: 10 }}>{latestRun ? <StatusBadge value={latestRun.readinessStatus} /> : null}</div>
          <p className="subtle">50 deterministic policy regression scenarios through the shared gateway. Not a model or telephony evaluation.</p>
        </div>
        <div className="panel compact">
          <div className="eyebrow">Layer 3</div>
          <h2 className="section-title">HTTP and retry contracts</h2>
          <div style={{ marginTop: 10 }}><StatusBadge value="succeeded" /></div>
          <p className="subtle">Covered by Vitest: webhook auth, malformed input, idempotency conflicts, tenant fail-closed, reconciliation, and approvals.</p>
        </div>
        <div className="panel compact">
          <div className="eyebrow">Layer 4</div>
          <h2 className="section-title">Postgres verification</h2>
          <div style={{ marginTop: 10 }}><StatusBadge value="succeeded" /></div>
          <p className="subtle">Neon correlation recorded the Bland-driven action and requisition.</p>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar-row">
          <div>
            <div className="eyebrow">Deterministic Regression</div>
            <h2 className="section-title">Business-side safety summary</h2>
          </div>
          {latestRun ? <StatusBadge value={latestRun.readinessStatus} /> : null}
        </div>
        {latestRun ? (
          <div className="metric-grid" style={{ marginTop: 12 }}>
            <div className="metric"><div className="eyebrow">Regression scenarios</div><div className="metric-value">50</div></div>
            <div className="metric"><div className="eyebrow">Passed</div><div className="metric-value">{50 - latestRun.failCount}</div></div>
            <div className="metric"><div className="eyebrow">Unsafe actions</div><div className="metric-value">{latestRun.unsafeActionCount}</div></div>
            <div className="metric"><div className="eyebrow">Audit coverage</div><div className="metric-value">{latestRun.auditCoverage}%</div></div>
            <div className="metric"><div className="eyebrow">Bypass defense</div><div className="metric-value">{latestRun.policyBypassDefenseRate}%</div></div>
            <div className="metric"><div className="eyebrow">Duplicate prevention</div><div className="metric-value">{latestRun.duplicatePreventionPassRate}%</div></div>
            <div className="metric"><div className="eyebrow">Created approvals</div><div className="metric-value">{latestRun.createdApprovalsCount}</div></div>
            <div className="metric"><div className="eyebrow">Created requisitions</div><div className="metric-value">{latestRun.createdRequisitionsCount}</div></div>
          </div>
        ) : (
          <p className="subtle">No eval run recorded yet. The page will surface metrics after `npm run eval`.</p>
        )}
      </section>
      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
        <div className="panel">
          <div className="eyebrow">Eval Markdown</div>
          <pre className="mono">{readDoc("eval-results.md")}</pre>
        </div>
        <div className="panel">
          <div className="eyebrow">Readiness Report</div>
          <pre className="mono">{readDoc("deployment-readiness-report.md")}</pre>
        </div>
        <div className="panel">
          <div className="eyebrow">External Evidence Index</div>
          <pre className="mono">{externalEvidence}</pre>
        </div>
      </section>
    </main>
  );
}
