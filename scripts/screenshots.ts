import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:3000";
const screenshotDir = path.join(process.cwd(), "docs", "screenshots");

async function serverIsReady() {
  try {
    const response = await fetch(baseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (await serverIsReady()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function postJson(pathname: string, body?: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.OPERATOR_API_SECRET ? { "x-operator-secret": process.env.OPERATOR_API_SECRET } : {})
    },
    body: JSON.stringify(body ?? {})
  });

  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

async function runScenario(body: Record<string, unknown>) {
  return postJson("/api/demo/run-scenario", body);
}

function readObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });

  let devServer: ChildProcess | null = null;
  if (!(await serverIsReady())) {
    devServer = spawn("npm", ["run", "dev"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PORT: "3000" }
    });
    await waitForServer();
  }

  try {
    await postJson("/api/demo/seed-evidence");

    const success = await runScenario({
      scenarioId: "screenshot-success",
      callerPhone: "+15550000001",
      transcript: "This is Raj from Site A. We need 37 bags of cement tomorrow morning.",
      idempotencyKey: "screenshot-success"
    });

    const approval = await runScenario({
      scenarioId: "screenshot-approval",
      callerPhone: "+15550000001",
      transcript: "This is Raj from Site A. We need 500 bags of cement tomorrow.",
      idempotencyKey: "screenshot-approval"
    });

    const recoveredFirst = await runScenario({
      scenarioId: "screenshot-recovery",
      callerPhone: "+15550000001",
      transcript: "This is Raj from Site A. We need 38 bags of cement tomorrow morning.",
      idempotencyKey: "screenshot-recovery",
      sourceMetadata: { failureMode: "mutated_response_lost" }
    });
    const recoveredRecords = readObject(recoveredFirst.relatedRecords);
    const recoveredActionRequestId = recoveredRecords?.actionRequestId;
    if (typeof recoveredActionRequestId !== "string") {
      throw new Error("Recovery scenario did not return an action request id.");
    }
    await postJson(`/api/action-requests/${recoveredActionRequestId}/reconcile`);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    const captures = [
      {
        name: "01-successful-action-trace.png",
        url: `/calls/${success.interactionId}`
      },
      {
        name: "02-approval-policy-decision.png",
        url: `/calls/${approval.interactionId}`
      },
      {
        name: "03-retry-recovery-trace.png",
        url: `/calls/${recoveredFirst.interactionId}`
      },
      {
        name: "04-layered-test-evidence.png",
        url: "/evals"
      }
    ];

    for (const capture of captures) {
      await page.goto(`${baseUrl}${capture.url}`, { waitUntil: "networkidle" });
      await page.screenshot({
        path: path.join(screenshotDir, capture.name),
        fullPage: true
      });
    }

    await browser.close();
    console.log(`Wrote ${captures.length} screenshots to ${screenshotDir}`);
  } finally {
    if (devServer) {
      devServer.kill("SIGTERM");
    }
  }
}

void main();
