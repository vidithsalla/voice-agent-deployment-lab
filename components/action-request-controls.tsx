"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { operatorFetch } from "@/lib/client/operator-fetch";

export function ActionRequestControls({
  actionRequestId,
  lifecycleState
}: {
  actionRequestId: string;
  lifecycleState: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"reconcile" | "retry" | null>(null);

  async function submit(action: "reconcile" | "retry") {
    setPending(action);
    await operatorFetch(`/api/action-requests/${actionRequestId}/${action}`, { method: "POST" });
    setPending(null);
    router.refresh();
  }

  const canReconcile = lifecycleState === "reconciliation_required";
  const canRetry = lifecycleState === "failed_retryable";

  if (!canReconcile && !canRetry) {
    return null;
  }

  return (
    <div className="cta-row">
      <button
        className="cta"
        disabled={!canReconcile || pending !== null}
        onClick={() => void submit("reconcile")}
        type="button"
      >
        {pending === "reconcile" ? "Reconciling..." : "Reconcile"}
      </button>
      <button
        className="cta secondary"
        disabled={!canRetry || pending !== null}
        onClick={() => void submit("retry")}
        type="button"
      >
        {pending === "retry" ? "Retrying..." : "Retry safely"}
      </button>
    </div>
  );
}
