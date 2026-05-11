import fs from "node:fs";
import path from "node:path";
import { evalScenarioSchema, type EvalScenario } from "@/lib/schemas/evals";

export function loadEvalScenarios(): EvalScenario[] {
  const scenariosDir = path.join(process.cwd(), "eval", "scenarios");
  const files = fs.readdirSync(scenariosDir).filter((file) => file.endsWith(".json")).sort();

  return files.map((file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(scenariosDir, file), "utf8"));
    return evalScenarioSchema.parse(raw);
  });
}
