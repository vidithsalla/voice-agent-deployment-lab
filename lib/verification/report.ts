import fs from "node:fs";
import path from "node:path";
import type { ScenarioGroupTrace } from "@/lib/verification/scenario-runner";

export function writeTraceVerificationReport(traces: ScenarioGroupTrace[]) {
  const lines = [
    "# Trace Verification",
    "",
    "This report verifies the shared loop:",
    "",
    "`transcript -> extraction -> caller -> policy -> action -> audit log -> eval assertion`",
    ""
  ];

  traces.forEach((group) => {
    lines.push(`## ${group.label}`);
    lines.push("");
    lines.push(`- Scenario id: ${group.groupId}`);
    lines.push(`- Description: ${group.description}`);
    lines.push(`- Passed: ${group.passed ? "yes" : "no"}`);
    if (group.notes.length > 0) {
      lines.push(`- Failure notes: ${group.notes.join(" | ")}`);
    }
    lines.push("");

    group.traces.forEach((trace, index) => {
      lines.push(`### Run ${index + 1}: ${trace.runId}`);
      lines.push("");
      lines.push(`- Transcript: ${trace.transcript}`);
      lines.push(`- Caller phone: ${trace.callerPhone}`);
      lines.push(`- Extracted intent: ${trace.response.intent}`);
      lines.push(`- Extraction mode/source: ${trace.response.extraction.mode} / ${trace.response.extraction.source}`);
      lines.push(`- Extracted fields: \`${JSON.stringify(trace.response.extractedFields)}\``);
      lines.push(`- Resolved caller: \`${JSON.stringify(trace.response.caller)}\``);
      lines.push(`- Policy decision: ${trace.response.policy.engineDecision} / ${trace.response.policyDecision}`);
      lines.push(`- Policy reasons: ${trace.response.policy.reasons.join(" | ")}`);
      lines.push(`- Guardrail flags: ${trace.response.guardrails.map((item) => item.code).join(", ") || "none"}`);
      lines.push(`- Action attempted: ${trace.response.action}`);
      lines.push(`- Final outcome: ${trace.response.outcome}`);
      lines.push(
        `- Created record ids: requisitions=${trace.requisitionIds.join(",") || "none"}, approvals=${trace.approvalIds.join(",") || "none"}, escalations=${trace.siteIssueIds.join(",") || "none"}, followup=${trace.followupId ?? "none"}`
      );
      lines.push(`- Audit log ids/count: ${trace.actionLogIds.join(", ") || "none"} / ${trace.actionLogIds.length}`);
      lines.push(`- Webhook event ids/count: ${trace.webhookEventIds.join(", ") || "none"} / ${trace.webhookEventIds.length}`);
      lines.push(`- Guardrail event ids/count: ${trace.guardrailEventIds.join(", ") || "none"} / ${trace.guardrailEventIds.length}`);
      lines.push(`- Eval pass/fail: ${trace.passed ? "pass" : "fail"}`);
      lines.push(`- Failure reason: ${trace.notes.join(" | ") || "none"}`);
      lines.push("");
      lines.push("#### Timeline");
      lines.push("");
      trace.response.timeline.forEach((step) => {
        lines.push(
          `- ${step.step}: ${step.status} at ${step.timestamp} (${step.latencyMs}ms) | input=${step.inputSummary} | output=${step.outputSummary} | guardrails=${step.guardrails.join(",") || "none"} | reasons=${step.reasons.join(" / ") || "none"}`
        );
      });
      lines.push("");
    });
  });

  fs.writeFileSync(path.join(process.cwd(), "docs", "trace-verification.md"), `${lines.join("\n")}\n`);
}
