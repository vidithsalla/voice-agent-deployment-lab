"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { operatorFetch } from "@/lib/client/operator-fetch";

export function ApprovalActions({ approvalId, disabled }: { approvalId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  async function submit(action: "approve" | "reject") {
    setPending(action);
    await operatorFetch(`/api/approvals/${approvalId}/${action}`, { method: "POST" });
    setPending(null);
    router.refresh();
  }

  return (
    <div className="cta-row">
      <button
        className="cta"
        disabled={disabled || pending !== null}
        onClick={() => void submit("approve")}
        type="button"
      >
        {pending === "approve" ? "Approving..." : "Approve"}
      </button>
      <button
        className="cta secondary"
        disabled={disabled || pending !== null}
        onClick={() => void submit("reject")}
        type="button"
      >
        {pending === "reject" ? "Rejecting..." : "Reject"}
      </button>
    </div>
  );
}
