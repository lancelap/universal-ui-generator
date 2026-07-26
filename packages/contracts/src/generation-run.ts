import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

export const StageStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("completed"),
  Type.Literal("blocked"),
  Type.Literal("skipped"),
]);

export const GenerationRunSchema = closedObject({
  schema: Type.Literal("generation-run/v1"),
  runId: Type.String({ minLength: 1 }),
  status: Type.Union([
    Type.Literal("completed"),
    Type.Literal("completed-with-warnings"),
    Type.Literal("blocked"),
  ]),
  stages: closedObject({
    fetch: StageStatusSchema,
    normalize: StageStatusSchema,
    summarize: StageStatusSchema,
    plan: StageStatusSchema,
    resolve: StageStatusSchema,
  }),
  artifacts: closedObject({
    snapshot: Type.String({ minLength: 1 }),
    designIr: Type.String({ minLength: 1 }),
    designSummary: Type.String({ minLength: 1 }),
    uiManifest: Type.String({ minLength: 1 }),
    resolutionPlan: Type.String({ minLength: 1 }),
    diagnostics: Type.String({ minLength: 1 }),
  }),
});

export type StageStatus = Static<typeof StageStatusSchema>;
export type GenerationRun = Static<typeof GenerationRunSchema>;
