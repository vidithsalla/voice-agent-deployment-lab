import type { CallerContext } from "@/lib/db/types";
import { getBudgetStatus } from "@/lib/actions/budget";
import { getPurchaseOrderStatus } from "@/lib/actions/purchaseOrders";
import { findDuplicateMaterialRequest } from "@/lib/actions/requisitions";
import { findSiteByName } from "@/lib/actions/sites";
import type { IntentType } from "@/lib/db/types";
import { hasRequiredFields, roleCanCreateRequisition, roleCanViewFinance, siteAccessAllowed } from "@/lib/policies/rules";
import type { PolicyResult } from "@/lib/policies/types";
import type { ExtractedFields } from "@/lib/simulator/extraction";

interface EvaluatePolicyInput {
  caller: CallerContext | null;
  intent: IntentType;
  fields: ExtractedFields;
}

function buildResult(input: {
  decision: PolicyResult["engineDecision"];
  guardrails: PolicyResult["guardrails"];
  reasons: string[];
  requiredClarifications?: string[];
  checks: PolicyResult["checks"];
}): PolicyResult {
  const decision =
    input.decision === "allow" || input.decision === "escalate"
      ? "allowed"
      : input.decision === "clarify"
        ? "clarification_needed"
        : input.decision === "route_to_approval"
          ? "approval_required"
          : "blocked";

  return {
    allowed: input.decision === "allow" || input.decision === "escalate",
    decision,
    engineDecision: input.decision,
    guardrails: input.guardrails,
    reasons: input.reasons,
    requiredClarifications: input.requiredClarifications,
    checks: input.checks
  };
}

export async function evaluatePolicy({ caller, intent, fields }: EvaluatePolicyInput): Promise<PolicyResult> {
  const guardrails: PolicyResult["guardrails"] = [];
  const reasons: string[] = [];
  const requiredClarifications: string[] = [];
  const checks: PolicyResult["checks"] = [];

  const isMutation =
    intent === "create_material_request" || intent === "escalate_site_issue";
  const isReadOnly =
    intent === "check_stock" || intent === "check_po_status" || intent === "check_vendor_payment";

  const callerKnown = Boolean(caller?.known);
  checks.push({
    name: "caller_known",
    passed: callerKnown,
    reason: callerKnown ? "Caller identity resolved from phone number." : "Caller phone number is not recognized."
  });

  if (isMutation || isReadOnly) {
    checks.push({
      name: isMutation ? "mutation_requires_authorized_caller" : "read_only_action_allowed",
      passed: callerKnown,
      reason: callerKnown
        ? "Caller is known and can be evaluated against policy."
        : "Unknown callers cannot access scoped enterprise workflows."
    });
  }

  if (!callerKnown && (isMutation || isReadOnly)) {
    guardrails.push({
      code: "unknown_caller",
      reason: "Unknown callers cannot access scoped enterprise workflows."
    });
    reasons.push("Unknown caller cannot be authorized for this action.");
    return buildResult({ decision: "block", guardrails, reasons, checks });
  }

  if (fields.bypassAttempt) {
    checks.push({
      name: "approval_bypass_attempt",
      passed: false,
      reason: "Transcript contains an explicit request to skip or bypass approval."
    });
    guardrails.push({
      code: "approval_bypass_attempt",
      reason: "Attempts to bypass approval are blocked."
    });
    reasons.push("Approval bypass attempt detected.");
    return buildResult({ decision: "block", guardrails, reasons, checks });
  } else {
    checks.push({
      name: "approval_bypass_attempt",
      passed: true,
      reason: "No approval bypass language detected."
    });
  }

  if (!hasRequiredFields(intent, fields)) {
    const missing =
      intent === "create_material_request"
        ? ["siteName", "materialName", "quantity", "neededBy"]
        : intent === "check_stock"
          ? ["siteName", "materialName"]
          : intent === "check_po_status"
            ? ["poCode"]
            : intent === "check_vendor_payment"
              ? ["vendorName"]
              : intent === "escalate_site_issue"
                ? ["siteName", "issueSummary"]
                : [];
    missing.forEach((field) => {
      if (!fields[field as keyof ExtractedFields]) {
        requiredClarifications.push(field);
      }
    });
    checks.push({
      name: "required_fields_present",
      passed: false,
      reason: `Missing required fields: ${requiredClarifications.join(", ")}.`
    });
    guardrails.push({
      code: "missing_required_fields",
      reason: "Required structured fields are missing from the request."
    });
    reasons.push("Required fields are missing.");
    return buildResult({ decision: "clarify", guardrails, reasons, requiredClarifications, checks });
  } else {
    checks.push({
      name: "required_fields_present",
      passed: true,
      reason: "All required fields for this intent are present."
    });
  }

  const site = fields.siteName ? await findSiteByName(fields.siteName) : null;
  if (fields.siteName && !siteAccessAllowed(caller, site?.id ?? null)) {
    checks.push({
      name: "site_access_allowed",
      passed: false,
      reason: `Caller does not have access to ${fields.siteName}.`
    });
    guardrails.push({
      code: "site_access_denied",
      reason: `Caller does not have access to ${fields.siteName}.`
    });
    reasons.push(`Site access denied for ${fields.siteName}.`);
    return buildResult({ decision: "block", guardrails, reasons, checks });
  } else if (fields.siteName) {
    checks.push({
      name: "site_access_allowed",
      passed: true,
      reason: `Caller has access to ${fields.siteName}.`
    });
  }

  if (intent === "create_material_request") {
    if (!roleCanCreateRequisition(caller)) {
      checks.push({
        name: "role_can_create_requisition",
        passed: false,
        reason: "Caller role cannot create requisitions."
      });
      guardrails.push({
        code: "site_access_denied",
        reason: "Caller role cannot create requisitions."
      });
      reasons.push("Caller role is not allowed to create requisitions.");
      return buildResult({ decision: "block", guardrails, reasons, checks });
    }

    checks.push({
      name: "role_can_create_requisition",
      passed: true,
      reason: "Caller role can create requisitions."
    });

    checks.push({
      name: "mutation_requires_authorized_caller",
      passed: true,
      reason: "Mutation request is associated with a known authorized caller."
    });

    if (!site) {
      reasons.push("No valid site was resolved.");
      return buildResult({ decision: "block", guardrails, reasons, checks });
    }

    const duplicate = await findDuplicateMaterialRequest({
      callerUserId: caller?.userId ?? "",
      materialName: fields.materialName ?? "",
      quantity: fields.quantity ?? 0,
      neededBy: fields.neededBy ?? "",
      siteId: site?.id ?? ""
    });

    if (duplicate) {
      checks.push({
        name: "duplicate_request_check",
        passed: false,
        reason: "A matching material request already exists."
      });
      guardrails.push({
        code: "duplicate_request",
        reason: "A matching requisition already exists."
      });
      reasons.push("Duplicate material request detected.");
      return buildResult({ decision: "block", guardrails, reasons, checks });
    }

    checks.push({
      name: "duplicate_request_check",
      passed: true,
      reason: "No duplicate requisition fingerprint was found."
    });

    const budget = await getBudgetStatus({
      siteName: fields.siteName ?? "",
      materialName: fields.materialName ?? "",
      quantity: fields.quantity ?? 0
    });

    if (!budget.withinLimit) {
      checks.push({
        name: "budget_within_limit",
        passed: false,
        reason: `Estimated cost ${budget.estimatedCost} exceeds remaining budget ${budget.remainingBudget}.`
      });
      guardrails.push({
        code: "budget_exceeded",
        reason: `Estimated cost ${budget.estimatedCost} exceeds remaining budget ${budget.remainingBudget}.`
      });
      reasons.push("Budget limit exceeded, route to approval.");
      return buildResult({ decision: "route_to_approval", guardrails, reasons, checks });
    }

    checks.push({
      name: "budget_within_limit",
      passed: true,
      reason: `Estimated cost ${budget.estimatedCost} is within remaining budget ${budget.remainingBudget}.`
    });
  }

  if (intent === "check_stock") {
    checks.push({
      name: "read_only_action_allowed",
      passed: true,
      reason: "Read-only stock lookup is permitted for this caller and site."
    });
  }

  if (intent === "check_po_status") {
    const po = await getPurchaseOrderStatus(fields.poCode ?? "");
    if (po && !siteAccessAllowed(caller, po.siteId)) {
      checks.push({
        name: "site_access_allowed",
        passed: false,
        reason: `Caller does not have access to the site attached to ${po.code}.`
      });
      guardrails.push({
        code: "site_access_denied",
        reason: `Caller does not have access to the site attached to ${po.code}.`
      });
      reasons.push("PO belongs to a site the caller cannot access.");
      return buildResult({ decision: "block", guardrails, reasons, checks });
    }

    checks.push({
      name: "read_only_action_allowed",
      passed: true,
      reason: po
        ? `Read-only PO lookup is permitted for ${po.code}.`
        : "PO lookup is allowed; missing PO returns a read-only not-found outcome."
    });
  }

  if (intent === "check_vendor_payment") {
    if (!roleCanViewFinance(caller)) {
      checks.push({
        name: "role_can_view_finance",
        passed: false,
        reason: "Caller role cannot view finance data."
      });
      guardrails.push({
        code: "restricted_finance_access",
        reason: "Finance payment data is restricted by role."
      });
      reasons.push("Finance access denied for this caller role.");
      return buildResult({ decision: "block", guardrails, reasons, checks });
    }

    checks.push({
      name: "role_can_view_finance",
      passed: true,
      reason: "Caller role is allowed to view finance data."
    });

    checks.push({
      name: "read_only_action_allowed",
      passed: true,
      reason: "Read-only vendor payment lookup is permitted for this caller."
    });
  }

  if (intent === "escalate_site_issue") {
    checks.push({
      name: "emergency_escalation",
      passed: true,
      reason: "Urgent issue language requires immediate escalation."
    });
    guardrails.push({
      code: "emergency_escalation",
      reason: "Urgent site issues escalate immediately."
    });
    reasons.push("Emergency escalation required.");
    return buildResult({ decision: "escalate", guardrails, reasons, checks });
  }

  return buildResult({
    decision: "allow",
    guardrails,
    reasons: reasons.length > 0 ? reasons : ["Policy checks passed."],
    checks
  });
}
