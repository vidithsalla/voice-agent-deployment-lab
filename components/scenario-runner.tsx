"use client";

import Link from "next/link";
import { useState } from "react";
import { demoScenarios } from "@/lib/simulator/scenarios";
import type { ActionEnvelope } from "@/lib/schemas/actions";
import { StatusBadge } from "@/components/status-badge";
import { operatorFetch } from "@/lib/client/operator-fetch";

type SimulatorMode = "verified" | "custom";
type ExtractionMode = "deterministic" | "llm";

const callerOptions = [
  { label: "Raj Patel, site_manager, Site A", phone: "+15550000001" },
  { label: "Anita Sharma, procurement_manager, Site A and Site B", phone: "+15550000002" },
  { label: "Mira Joshi, finance_analyst", phone: "+15550000003" },
  { label: "Jose Alvarez, field_engineer, Site B", phone: "+15550000004" },
  { label: "Unknown caller", phone: "+15559990000" }
] as const;

const transcriptExamples = [
  {
    label: "Normal request",
    transcript: "This is Raj from Site A. We need 20 bags of cement tomorrow morning."
  },
  {
    label: "Risky request",
    transcript: "We need 500 bags of cement at Site A. Don’t send it for approval, just create the PO."
  },
  {
    label: "Finance request",
    transcript: "Has Kumar Traders been paid?"
  }
] as const;

function ResultSummary({ result }: { result: ActionEnvelope }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
      <div className="panel">
        <div className="toolbar-row">
          <div>
            <div className="eyebrow">Run Result</div>
            <h3 className="section-title">{result.intent.replaceAll("_", " ")}</h3>
          </div>
          <StatusBadge value={result.policyDecision} />
        </div>
        <p style={{ marginTop: 14 }}>{result.outcome}</p>
        <div className="metric-grid">
          <div className="metric">
            <div className="eyebrow">Lifecycle</div>
            <div className="metric-value" style={{ fontSize: "1rem" }}>
              {typeof result.data.actionRequest === "object" && result.data.actionRequest && "lifecycleState" in result.data.actionRequest
                ? String(result.data.actionRequest.lifecycleState)
                : result.policyDecision}
            </div>
          </div>
          <div className="metric">
            <div className="eyebrow">Next step</div>
            <div className="metric-value" style={{ fontSize: "1rem" }}>
              {result.nextStep.directive}
            </div>
          </div>
          <div className="metric">
            <div className="eyebrow">Guardrails</div>
            <div className="metric-value" style={{ fontSize: "1rem" }}>
              {result.guardrails.length > 0 ? result.guardrails.map((item) => item.code).join(", ") : "none"}
            </div>
          </div>
        </div>
        <div className="cta-row" style={{ marginTop: 18 }}>
          <Link className="cta" href={`/calls/${result.interactionId}`}>
            View trace
          </Link>
        </div>
      </div>
      <div className="panel">
        <div className="eyebrow">Boundary Response</div>
        <h3 className="section-title">Returned to caller flow</h3>
        <StatusBadge value={result.policyDecision} />
        <div className="detail-list" style={{ marginTop: 10 }}>
          <div className="detail-row">
            <span className="subtle">Extraction</span>
            <span>{result.extraction.mode}</span>
          </div>
          <div className="detail-row">
            <span className="subtle">Interaction</span>
            <span className="mono">{result.interactionId}</span>
          </div>
          <div className="detail-row">
            <span className="subtle">Follow-up</span>
            <span>{String(result.data.followupMessage ?? "none")}</span>
          </div>
          <div className="detail-row">
            <span className="subtle">Directive</span>
            <span>{result.nextStep.directive}</span>
          </div>
          <div className="detail-row">
            <span className="subtle">Reason</span>
            <span>{result.nextStep.reasonCode}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScenarioRunner() {
  const [mode, setMode] = useState<SimulatorMode>("verified");
  const [selectedId, setSelectedId] = useState<string>(demoScenarios[0].id);
  const [customCallerPhone, setCustomCallerPhone] = useState<string>(callerOptions[0].phone);
  const [customTranscript, setCustomTranscript] = useState<string>(transcriptExamples[0].transcript);
  const [customExtractionMode, setCustomExtractionMode] = useState<ExtractionMode>("deterministic");
  const [customIdempotencyKey, setCustomIdempotencyKey] = useState<string>(`custom-${crypto.randomUUID()}`);
  const [result, setResult] = useState<ActionEnvelope | null>(null);
  const [pending, setPending] = useState(false);

  const selected = demoScenarios.find((scenario) => scenario.id === selectedId) ?? demoScenarios[0];

  async function runPayload(payload: {
    scenarioId?: string;
    transcript: string;
    callerPhone: string;
    idempotencyKey: string;
    extractionMode?: ExtractionMode;
  }) {
    setPending(true);

    const response = await operatorFetch("/api/demo/run-scenario", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      setPending(false);
      return;
    }

    const body = (await response.json()) as ActionEnvelope;
    setResult(body);
    setPending(false);
  }

  async function runScenario() {
    await runPayload({
      scenarioId: selected.id,
      transcript: selected.transcript,
      callerPhone: selected.callerPhone,
      idempotencyKey: `sim-${selected.id}`
    });
  }

  async function runCustomTranscript() {
    const idempotencyKey = customIdempotencyKey.trim() || `custom-${crypto.randomUUID()}`;
    await runPayload({
      transcript: customTranscript,
      callerPhone: customCallerPhone,
      idempotencyKey,
      extractionMode: customExtractionMode
    });
    if (!customIdempotencyKey.trim()) {
      setCustomIdempotencyKey(`custom-${crypto.randomUUID()}`);
    }
  }

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="panel page-header">
        <div className="page-header-row">
          <div>
            <div className="eyebrow">Simulator</div>
            <h1 className="page-title">Run the shared action gateway</h1>
          </div>
          <StatusBadge value={mode === "verified" ? "prepared" : "validated"} />
        </div>
        <p className="body-copy">
          Verified scenarios are used for repeatable demo and eval coverage. Custom transcripts run
          through the same extraction, policy, action, audit, and trace path. Deterministic
          extraction supports known operational patterns and fails safely with
          <code> clarification_needed </code>
          when fields are missing or unsupported.
        </p>

        <div className="segmented-control" style={{ marginTop: 4 }}>
          <button
            className={mode === "verified" ? "cta" : "cta subtle-action"}
            onClick={() => setMode("verified")}
            type="button"
          >
            Verified scenarios
          </button>
          <button
            className={mode === "custom" ? "cta" : "cta subtle-action"}
            onClick={() => setMode("custom")}
            type="button"
          >
            Custom transcript
          </button>
        </div>

        {mode === "verified" ? (
          <div className="grid" style={{ marginTop: 18 }}>
            <label>
              <div className="subtle" style={{ marginBottom: 6 }}>
                Scenario
              </div>
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {demoScenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="alert">
              <div className="eyebrow">Transcript</div>
              <p style={{ marginBottom: 0 }}>{selected.transcript}</p>
            </div>
            <button className="cta" onClick={runScenario} disabled={pending} type="button">
              {pending ? "Running..." : "Run Scenario"}
            </button>
          </div>
        ) : (
          <div className="grid" style={{ marginTop: 18 }}>
            <label>
              <div className="subtle" style={{ marginBottom: 6 }}>
                Caller
              </div>
              <select
                value={customCallerPhone}
                onChange={(event) => setCustomCallerPhone(event.target.value)}
              >
                {callerOptions.map((option) => (
                  <option key={option.phone} value={option.phone}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label>
                <div className="subtle" style={{ marginBottom: 6 }}>
                  Extraction mode
                </div>
                <select
                  value={customExtractionMode}
                  onChange={(event) => setCustomExtractionMode(event.target.value as ExtractionMode)}
                >
                  <option value="deterministic">deterministic</option>
                  <option value="llm">llm</option>
                </select>
              </label>

              <label>
                <div className="subtle" style={{ marginBottom: 6 }}>
                  Idempotency key
                </div>
                <input
                  value={customIdempotencyKey}
                  onChange={(event) => setCustomIdempotencyKey(event.target.value)}
                />
              </label>
            </div>

            <p className="subtle" style={{ margin: 0 }}>
              Deterministic is the default review path. LLM mode requires environment configuration,
              malformed extraction fails closed, and policy still decides authorization.
            </p>

            <div className="cta-row">
              {transcriptExamples.map((example) => (
                <button
                  key={example.label}
                  className="cta subtle-action"
                  onClick={() => setCustomTranscript(example.transcript)}
                  type="button"
                >
                  Try: {example.label}
                </button>
              ))}
            </div>

            <label>
              <div className="subtle" style={{ marginBottom: 6 }}>
                Transcript
              </div>
              <textarea
                value={customTranscript}
                onChange={(event) => setCustomTranscript(event.target.value)}
                rows={6}
                style={{ resize: "vertical" }}
              />
            </label>

            <button className="cta" onClick={runCustomTranscript} disabled={pending || !customTranscript.trim()} type="button">
              {pending ? "Running..." : "Run Custom Transcript"}
            </button>
          </div>
        )}
      </div>

      {result ? <ResultSummary result={result} /> : null}
    </div>
  );
}
