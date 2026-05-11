"use client";

import { useState } from "react";
import { demoScenarios } from "@/lib/simulator/scenarios";
import type { ActionEnvelope } from "@/lib/schemas/actions";
import { StatusBadge } from "@/components/status-badge";

export function ScenarioRunner() {
  const [selectedId, setSelectedId] = useState<string>(demoScenarios[0].id);
  const [result, setResult] = useState<ActionEnvelope | null>(null);
  const [pending, setPending] = useState(false);

  const selected = demoScenarios.find((scenario) => scenario.id === selectedId) ?? demoScenarios[0];

  async function runScenario() {
    setPending(true);

    const response = await fetch("/api/demo/run-scenario", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scenarioId: selected.id,
        transcript: selected.transcript,
        callerPhone: selected.callerPhone,
        idempotencyKey: `sim-${selected.id}`
      })
    });

    const payload = (await response.json()) as ActionEnvelope;
    setResult(payload);
    setPending(false);
  }

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="panel">
        <div className="eyebrow">Scenario Selector</div>
        <h2 style={{ marginTop: 8 }}>Simulator</h2>
        <p className="subtle">
          Deterministic mode keeps review runs reproducible, but the same action gateway can also
          accept Bland-style variables or optional LLM extraction. Policy enforcement stays
          independent of extraction mode.
        </p>
        <div className="grid" style={{ marginTop: 18 }}>
          <label>
            <div className="subtle" style={{ marginBottom: 6 }}>
              Scenario
            </div>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--line)" }}
            >
              {demoScenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
          </label>
          <div className="panel" style={{ background: "rgba(255,255,255,0.7)" }}>
            <div className="subtle">Transcript</div>
            <p style={{ marginBottom: 0 }}>{selected.transcript}</p>
          </div>
          <button className="cta" onClick={runScenario} disabled={pending}>
            {pending ? "Running..." : "Run Scenario"}
          </button>
        </div>
      </div>

      {result ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div className="panel">
            <div className="eyebrow">Decision</div>
            <h3>{result.intent.replaceAll("_", " ")}</h3>
            <StatusBadge value={result.policyDecision} />
            <p style={{ marginTop: 14 }}>{result.outcome}</p>
          </div>
          <div className="panel">
            <div className="eyebrow">Policy</div>
            <pre>{JSON.stringify(result.policy, null, 2)}</pre>
          </div>
          <div className="panel">
            <div className="eyebrow">Extraction</div>
            <pre>{JSON.stringify({ extraction: result.extraction, fields: result.extractedFields }, null, 2)}</pre>
          </div>
          <div className="panel">
            <div className="eyebrow">Guardrails</div>
            <pre>{JSON.stringify(result.guardrails, null, 2)}</pre>
          </div>
          <div className="panel">
            <div className="eyebrow">Action Data</div>
            <pre>{JSON.stringify(result.data, null, 2)}</pre>
          </div>
          <div className="panel">
            <div className="eyebrow">Timeline</div>
            <pre>{JSON.stringify(result.timeline, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
