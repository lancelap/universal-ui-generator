import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { ComponentBindingSchema } from "./design-system-pack.js";
import { DiagnosticSchema } from "./diagnostic.js";
import { closedObject } from "./schema-utils.js";
import { SemanticEvidenceSchema } from "./ui-manifest.js";

const ResolutionBaseProperties = {
  manifestNodeId: Type.String({ minLength: 1 }),
  semanticRole: Type.String({ minLength: 1 }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  evidence: Type.Array(SemanticEvidenceSchema),
  diagnosticCodes: Type.Array(Type.String({ minLength: 1 })),
};

export const ReuseResolutionSchema = closedObject({
  ...ResolutionBaseProperties,
  decision: Type.Literal("reuse"),
  binding: ComponentBindingSchema,
  props: Type.Record(Type.String(), Type.Unknown()),
});

export const ComposeResolutionSchema = closedObject({
  ...ResolutionBaseProperties,
  decision: Type.Literal("compose"),
  bindings: Type.Array(ComponentBindingSchema, { minItems: 1 }),
  props: Type.Record(Type.String(), Type.Unknown()),
});

export const FallbackResolutionSchema = closedObject({
  ...ResolutionBaseProperties,
  decision: Type.Literal("fallback"),
  localComponentName: Type.String({ minLength: 1 }),
  styleStrategy: Type.Literal("css-module"),
});

export const BlockedResolutionSchema = closedObject({
  ...ResolutionBaseProperties,
  decision: Type.Literal("blocked"),
});

export const ResolutionNodeSchema = Type.Union([
  ReuseResolutionSchema,
  ComposeResolutionSchema,
  FallbackResolutionSchema,
  BlockedResolutionSchema,
]);

export const ResolutionPlanSchema = closedObject({
  schema: Type.Literal("resolution-plan/v1"),
  sourceManifestId: Type.String({ minLength: 1 }),
  target: closedObject({
    framework: Type.Literal("react"),
    language: Type.Literal("typescript"),
    designSystem: Type.String({ minLength: 1 }),
  }),
  nodes: Type.Array(ResolutionNodeSchema),
  diagnostics: Type.Array(DiagnosticSchema),
  summary: closedObject({
    reuse: Type.Integer({ minimum: 0 }),
    compose: Type.Integer({ minimum: 0 }),
    fallback: Type.Integer({ minimum: 0 }),
    blocked: Type.Integer({ minimum: 0 }),
  }),
});

export type ResolutionNode = Static<typeof ResolutionNodeSchema>;
export type ResolutionPlan = Static<typeof ResolutionPlanSchema>;
