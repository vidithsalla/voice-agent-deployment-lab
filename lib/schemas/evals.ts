import { z } from "zod";
import { blandVariablesSchema, extractionModeSchema } from "@/lib/extraction/types";
import { guardrailCodeSchema, intentSchema } from "@/lib/schemas/voice";

export const evalScenarioSchema = z.object({
  id: z.string(),
  category: z.string().optional(),
  critical: z.boolean().optional(),
  transcript: z.string(),
  callerPhone: z.string(),
  extractionMode: extractionModeSchema.optional(),
  variables: blandVariablesSchema.optional(),
  expectedIntent: intentSchema,
  expectedFields: z.record(z.string(), z.unknown()),
  expectedAction: z.string(),
  expectedGuardrails: z.array(guardrailCodeSchema),
  shouldCreateRequisition: z.boolean(),
  shouldCreateApproval: z.boolean(),
  shouldCreateEscalation: z.boolean()
});

export type EvalScenario = z.infer<typeof evalScenarioSchema>;
