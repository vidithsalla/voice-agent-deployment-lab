import { writeTraceVerificationReport } from "@/lib/verification/report";
import { runScenarioGroup } from "@/lib/verification/scenario-runner";
import { canonicalTraceScenarios } from "@/lib/verification/scenarios";

function formatCell(value: string, width: number) {
  return value.length >= width ? value.slice(0, width - 1) + "…" : value.padEnd(width, " ");
}

async function main() {
  const traces = [];
  for (const scenario of canonicalTraceScenarios) {
    traces.push(await runScenarioGroup(scenario, { resetBeforeGroup: true }));
  }

  writeTraceVerificationReport(traces);

  const header = [
    formatCell("scenario", 28),
    formatCell("policy", 20),
    formatCell("actionLogs", 12),
    formatCell("records", 16),
    formatCell("result", 8)
  ].join(" | ");

  console.log(header);
  console.log("-".repeat(header.length));

  traces.forEach((group) => {
    const lastTrace = group.traces.at(-1);
    const recordSummary = lastTrace
      ? `r:${lastTrace.requisitionIds.length} a:${lastTrace.approvalIds.length} e:${lastTrace.siteIssueIds.length}`
      : "n/a";
    const policySummary = lastTrace
      ? `${lastTrace.response.policy.engineDecision}/${lastTrace.response.policyDecision}`
      : "n/a";

    console.log(
      [
        formatCell(group.groupId, 28),
        formatCell(policySummary, 20),
        formatCell(String(lastTrace?.actionLogIds.length ?? 0), 12),
        formatCell(recordSummary, 16),
        formatCell(group.passed ? "pass" : "fail", 8)
      ].join(" | ")
    );
  });

  const failed = traces.filter((trace) => !trace.passed);
  if (failed.length > 0) {
    console.log("");
    console.log("Failures:");
    failed.forEach((trace) => {
      console.log(`- ${trace.groupId}: ${trace.notes.join("; ")}`);
    });
    process.exitCode = 1;
  }
}

void main();
