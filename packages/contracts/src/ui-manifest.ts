import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { DiagnosticSchema } from "./diagnostic.js";
import { closedObject } from "./schema-utils.js";

export const UiNodeKindSchema = Type.Union([
  Type.Literal("overlay"),
  Type.Literal("group"),
  Type.Literal("content"),
  Type.Literal("control"),
  Type.Literal("action"),
  Type.Literal("unresolved"),
]);

export const SemanticEvidenceSchema = closedObject({
  kind: Type.String({ minLength: 1 }),
  value: Type.String(),
  weight: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

export const UiNodeSchema = Type.Recursive((Self) =>
  closedObject({
    id: Type.String({ minLength: 1 }),
    kind: UiNodeKindSchema,
    role: Type.String({ minLength: 1 }),
    sourceNodeIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    evidence: Type.Array(SemanticEvidenceSchema),
    content: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    state: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    requiredCapabilities: Type.Optional(
      Type.Array(Type.String({ minLength: 1 })),
    ),
    formAdapter: Type.Optional(Type.String({ minLength: 1 })),
    children: Type.Array(Self),
  }),
);

export const UiManifestSchema = closedObject({
  schema: Type.Literal("ui-manifest/v1"),
  sourceArtifactId: Type.String({ minLength: 1 }),
  root: UiNodeSchema,
  diagnostics: Type.Array(DiagnosticSchema),
});

export const PixsoSemanticMappingSchema = closedObject({
  componentKey: Type.String({ minLength: 1 }),
  variant: Type.Optional(Type.String({ minLength: 1 })),
  kind: UiNodeKindSchema,
  role: Type.String({ minLength: 1 }),
});

export type UiNodeKind = Static<typeof UiNodeKindSchema>;
export type SemanticEvidence = Static<typeof SemanticEvidenceSchema>;
export type UiNode = Static<typeof UiNodeSchema>;
export type UiManifest = Static<typeof UiManifestSchema>;
export type PixsoSemanticMapping = Static<typeof PixsoSemanticMappingSchema>;
