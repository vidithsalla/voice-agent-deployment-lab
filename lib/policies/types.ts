import type {
  GuardrailCode,
  PolicyCheckResult,
  PolicyDecision,
  PolicyEngineDecision
} from "@/lib/db/types";

export interface PolicyResult {
  allowed: boolean;
  decision: PolicyDecision;
  engineDecision: PolicyEngineDecision;
  guardrails: Array<{
    code: GuardrailCode;
    reason: string;
  }>;
  reasons: string[];
  requiredClarifications?: string[];
  checks: PolicyCheckResult[];
}
