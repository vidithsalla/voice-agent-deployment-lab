import fs from "node:fs";
import path from "node:path";

interface ReportInput {
  summary: {
    total: number;
    passed: number;
    failed: number;
    intentAccuracy: number;
    fieldExtractionAccuracy: number;
    actionAccuracy: number;
    guardrailAccuracy: number;
    unsafeActionRate: number;
    unsafeActionCount: number;
    clarificationAccuracy: number;
    auditCoverage: number;
    policyBypassDefenseRate: number;
    financePrivacyPassRate: number;
    duplicatePreventionPassRate: number;
    createdRequisitionsCount: number;
    createdApprovalsCount: number;
    createdEscalationsCount: number;
    missingAuditLogCount: number;
    readinessStatus: "ready" | "conditionally_ready" | "not_ready";
  };
  failures: Array<{ scenarioId: string; notes: string[]; critical: boolean }>;
}

export function writeEvalReports(input: ReportInput) {
  const resultsMd = `# Eval Results (deterministic policy regression)

These figures come from a fixed set of scripted scenarios run through the deterministic policy gateway. They are not a model-quality, telephony, or production-reliability measurement.

- Total scenarios: ${input.summary.total}
- Passed: ${input.summary.passed}
- Failed: ${input.summary.failed}
- Intent accuracy: ${input.summary.intentAccuracy}%
- Field extraction accuracy: ${input.summary.fieldExtractionAccuracy}%
- Action accuracy: ${input.summary.actionAccuracy}%
- Guardrail accuracy: ${input.summary.guardrailAccuracy}%
- Clarification correctness: ${input.summary.clarificationAccuracy}%
- Audit coverage: ${input.summary.auditCoverage}%
- Policy-bypass defense rate: ${input.summary.policyBypassDefenseRate}%
- Finance privacy pass rate: ${input.summary.financePrivacyPassRate}%
- Duplicate prevention pass rate: ${input.summary.duplicatePreventionPassRate}%
- Unsafe action rate: ${input.summary.unsafeActionRate}%
- Unsafe action count: ${input.summary.unsafeActionCount}
- Created requisitions: ${input.summary.createdRequisitionsCount}
- Created approvals: ${input.summary.createdApprovalsCount}
- Created escalations: ${input.summary.createdEscalationsCount}
- Missing audit logs: ${input.summary.missingAuditLogCount}
- Readiness status: ${input.summary.readinessStatus}

## Failed scenarios

${input.failures.length === 0 ? "- None" : input.failures.map((failure) => `- ${failure.scenarioId} (${failure.critical ? "critical" : "non-critical"}): ${failure.notes.join("; ")}`).join("\n")}
`;

  const readinessMd = `# Deployment Readiness Report (deterministic policy regression)

## Summary

This harness ran ${input.summary.total} scripted policy regression scenarios through the shared voice action gateway. "Ready" means those scenarios passed with no unsafe mutation; it does not assess conversation quality or live traffic.

## Readiness Signals

- Intent accuracy: ${input.summary.intentAccuracy}%
- Field extraction accuracy: ${input.summary.fieldExtractionAccuracy}%
- Action accuracy: ${input.summary.actionAccuracy}%
- Guardrail accuracy: ${input.summary.guardrailAccuracy}%
- Audit coverage: ${input.summary.auditCoverage}%
- Policy-bypass defense rate: ${input.summary.policyBypassDefenseRate}%
- Finance privacy pass rate: ${input.summary.financePrivacyPassRate}%
- Duplicate prevention pass rate: ${input.summary.duplicatePreventionPassRate}%
- Unsafe action count: ${input.summary.unsafeActionCount}
- Missing audit logs: ${input.summary.missingAuditLogCount}

## Critical Failures

${input.failures.filter((item) => item.critical).length === 0 ? "- None" : input.failures.filter((item) => item.critical).map((failure) => `- ${failure.scenarioId}: ${failure.notes.join("; ")}`).join("\n")}

## Recommendation

${
  input.summary.readinessStatus === "ready"
    ? "Ready. No unsafe mutations occurred, audit coverage is 100%, and critical scenarios passed."
    : input.summary.readinessStatus === "conditionally_ready"
      ? "Conditionally ready. Unsafe mutations are still prevented, but non-critical eval failures remain."
      : "Not ready. Unsafe actions, audit gaps, or failed critical scenarios must be resolved before this change ships."
}
`;

  fs.writeFileSync(path.join(process.cwd(), "docs", "eval-results.md"), resultsMd);
  fs.writeFileSync(path.join(process.cwd(), "docs", "deployment-readiness-report.md"), readinessMd);
}
