import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { getRepository } from "@/lib/db/repository";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getRepository();
  const interaction = await repo.getInteractionById(id);

  if (!interaction) {
    notFound();
  }

  const [actions, webhooks, guardrails, followup] = await Promise.all([
    repo.listActionLogsByInteraction(id),
    repo.listWebhookEventsByInteraction(id),
    repo.listGuardrailsByInteraction(id),
    repo.getFollowupByInteraction(id)
  ]);
  const topLevelWebhook = webhooks.find((item) => item.actionName === interaction.actionAttempted);
  const policySnapshot =
    topLevelWebhook && typeof topLevelWebhook.responseBody === "object" && topLevelWebhook.responseBody
      ? (topLevelWebhook.responseBody as { policy?: unknown }).policy
      : null;
  const extractionSnapshot =
    topLevelWebhook && typeof topLevelWebhook.responseBody === "object" && topLevelWebhook.responseBody
      ? (topLevelWebhook.responseBody as { extraction?: unknown }).extraction
      : null;
  const timeline =
    topLevelWebhook && typeof topLevelWebhook.responseBody === "object" && topLevelWebhook.responseBody
      ? ((topLevelWebhook.responseBody as { timeline?: unknown }).timeline ?? [])
      : [];

  return (
    <main className="grid" style={{ gap: 20 }}>
      <section className="panel">
        <div className="eyebrow">Call Detail</div>
        <h1>{interaction.intent.replaceAll("_", " ")}</h1>
        <StatusBadge value={interaction.policyDecision} />
        <p style={{ marginTop: 18 }}>{interaction.transcript}</p>
      </section>
      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="panel">
          <div className="eyebrow">Extraction</div>
          <pre>{JSON.stringify({ extraction: extractionSnapshot, fields: interaction.extractedFields }, null, 2)}</pre>
        </div>
        <div className="panel">
          <div className="eyebrow">Guardrails</div>
          <pre>{JSON.stringify(guardrails, null, 2)}</pre>
        </div>
        <div className="panel">
          <div className="eyebrow">Policy Snapshot</div>
          <pre>{JSON.stringify(policySnapshot, null, 2)}</pre>
        </div>
        <div className="panel">
          <div className="eyebrow">Follow-up</div>
          <p>{followup?.message ?? "No follow-up recorded."}</p>
        </div>
      </section>
      <section className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel">
          <div className="eyebrow">Action Trace</div>
          <pre>{JSON.stringify(actions, null, 2)}</pre>
        </div>
        <div className="panel">
          <div className="eyebrow">Webhook Trace</div>
          <pre>{JSON.stringify(webhooks, null, 2)}</pre>
        </div>
      </section>
      <section className="panel">
        <div className="eyebrow">Decision Timeline</div>
        <pre>{JSON.stringify(timeline, null, 2)}</pre>
      </section>
    </main>
  );
}
