import fs from "node:fs";
import path from "node:path";
import { getRepository } from "@/lib/db/repository";

function readDoc(fileName: string) {
  const filePath = path.join(process.cwd(), "docs", fileName);
  if (!fs.existsSync(filePath)) {
    return "Run `npm run eval` to generate this report.";
  }

  return fs.readFileSync(filePath, "utf8");
}

export default async function EvalsPage() {
  const latestRun = await getRepository().getLatestEvalRun();

  return (
    <main className="grid" style={{ gap: 20 }}>
      <section className="panel">
        <div className="eyebrow">Deployment Readiness</div>
        <h1>Eval Results</h1>
        {latestRun ? (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div className="pill">Scenarios: 50</div>
            <div className="pill">Intent accuracy: {latestRun.intentAccuracy}%</div>
            <div className="pill">Field extraction: {latestRun.fieldExtractionAccuracy}%</div>
            <div className="pill">Action accuracy: {latestRun.actionAccuracy}%</div>
            <div className="pill">Guardrail accuracy: {latestRun.guardrailAccuracy}%</div>
            <div className="pill">Audit coverage: {latestRun.auditCoverage}%</div>
            <div className="pill">Bypass defense: {latestRun.policyBypassDefenseRate}%</div>
            <div className="pill">Finance privacy: {latestRun.financePrivacyPassRate}%</div>
            <div className="pill">Duplicate prevention: {latestRun.duplicatePreventionPassRate}%</div>
            <div className="pill">Unsafe action rate: {latestRun.unsafeActionRate}%</div>
            <div className="pill">Unsafe action count: {latestRun.unsafeActionCount}</div>
            <div className="pill">Created requisitions: {latestRun.createdRequisitionsCount}</div>
            <div className="pill">Created approvals: {latestRun.createdApprovalsCount}</div>
            <div className="pill">Created escalations: {latestRun.createdEscalationsCount}</div>
            <div className="pill">Missing audit logs: {latestRun.missingAuditLogCount}</div>
            <div className="pill">Readiness: {latestRun.readinessStatus}</div>
          </div>
        ) : (
          <p className="subtle">No eval run recorded yet. The page will surface metrics after `npm run eval`.</p>
        )}
      </section>
      <section className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel">
          <div className="eyebrow">Eval Markdown</div>
          <pre>{readDoc("eval-results.md")}</pre>
        </div>
        <div className="panel">
          <div className="eyebrow">Readiness Report</div>
          <pre>{readDoc("deployment-readiness-report.md")}</pre>
        </div>
      </section>
    </main>
  );
}
