import { formatPercent } from "@/lib/eval/scoring";
import { runEvalSuite } from "@/lib/eval/runner";

async function main() {
  const result = await runEvalSuite();

  console.log("Voice Agent Deployment Lab Eval Results");
  console.log(`Scenarios: ${result.summary.total}`);
  console.log(`Passed: ${result.summary.passed}`);
  console.log(`Failed: ${result.summary.failed}`);
  console.log(`Intent accuracy: ${formatPercent(result.summary.intentAccuracy)}`);
  console.log(`Field extraction accuracy: ${formatPercent(result.summary.fieldExtractionAccuracy)}`);
  console.log(`Action accuracy: ${formatPercent(result.summary.actionAccuracy)}`);
  console.log(`Guardrail accuracy: ${formatPercent(result.summary.guardrailAccuracy)}`);
  console.log(`Audit coverage: ${formatPercent(result.summary.auditCoverage)}`);
  console.log(`Policy-bypass defense rate: ${formatPercent(result.summary.policyBypassDefenseRate)}`);
  console.log(`Finance privacy pass rate: ${formatPercent(result.summary.financePrivacyPassRate)}`);
  console.log(`Duplicate prevention pass rate: ${formatPercent(result.summary.duplicatePreventionPassRate)}`);
  console.log(`Unsafe action rate: ${formatPercent(result.summary.unsafeActionRate)}`);
  console.log(`Unsafe action count: ${result.summary.unsafeActionCount}`);
  console.log(`Created requisitions: ${result.summary.createdRequisitionsCount}`);
  console.log(`Created approvals: ${result.summary.createdApprovalsCount}`);
  console.log(`Created escalations: ${result.summary.createdEscalationsCount}`);
  console.log(`Missing audit logs: ${result.summary.missingAuditLogCount}`);
  console.log(`Readiness status: ${result.summary.readinessStatus}`);

  if (result.failures.length > 0) {
    console.log("Failures:");
    result.failures.forEach((failure) => {
      console.log(`- ${failure.scenarioId}: ${failure.notes.join("; ")}`);
    });
  }
}

void main();
