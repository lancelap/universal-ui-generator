import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import type { DesignIRV2 } from "./design-ir-v2.js";
import { DiagnosticSchema } from "./diagnostic.js";
import { closedObject } from "./schema-utils.js";
import { SemanticEvidenceSchema, UiNodeKindSchema } from "./ui-manifest.js";

export const UiInteractionSchema = closedObject({
  key: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$" }),
  event: Type.Union([Type.Literal("activate"), Type.Literal("change")]),
  valueType: Type.Union([
    Type.Literal("void"),
    Type.Literal("string"),
    Type.Literal("boolean"),
    Type.Literal("number"),
  ]),
});

export const UiNodeV2Schema = Type.Recursive((Self) =>
  closedObject({
    id: Type.String({ minLength: 1 }),
    kind: UiNodeKindSchema,
    role: Type.String({ minLength: 1 }),
    sourceNodeIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    layoutSourceNodeId: Type.String({ minLength: 1 }),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    evidence: Type.Array(SemanticEvidenceSchema),
    content: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    state: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    requiredCapabilities: Type.Optional(
      Type.Array(Type.String({ minLength: 1 })),
    ),
    formAdapter: Type.Optional(Type.String({ minLength: 1 })),
    interactions: Type.Optional(Type.Array(UiInteractionSchema)),
    children: Type.Array(Self),
  }),
);

export const UiManifestV2Schema = closedObject({
  schema: Type.Literal("ui-manifest/v2"),
  sourceArtifactId: Type.String({ minLength: 1 }),
  root: UiNodeV2Schema,
  diagnostics: Type.Array(DiagnosticSchema),
});

export type UiInteraction = Static<typeof UiInteractionSchema>;
export type UiNodeV2 = Static<typeof UiNodeV2Schema>;
export type UiManifestV2 = Static<typeof UiManifestV2Schema>;

export function assertUiManifestV2Integrity(
  manifest: UiManifestV2,
  ir: DesignIRV2,
): void {
  visitUiNode(manifest.root, ir);
}

function visitUiNode(node: UiNodeV2, ir: DesignIRV2): void {
  if (!node.sourceNodeIds.includes(node.layoutSourceNodeId)) {
    throw new Error(
      `V2_CONTRACT_INTEGRITY: layout source "${node.layoutSourceNodeId}" is not a source node of "${node.id}"`,
    );
  }

  if (!(node.layoutSourceNodeId in ir.nodes)) {
    throw new Error(
      `V2_CONTRACT_INTEGRITY: layout source "${node.layoutSourceNodeId}" for "${node.id}" is missing from DesignIR`,
    );
  }

  const interactionKeys = new Set<string>();
  for (const interaction of node.interactions ?? []) {
    if (interactionKeys.has(interaction.key)) {
      throw new Error(
        `V2_CONTRACT_INTEGRITY: duplicate interaction key "${interaction.key}" on "${node.id}"`,
      );
    }
    interactionKeys.add(interaction.key);

    if (interaction.event === "activate" && interaction.valueType !== "void") {
      throw new Error(
        `V2_CONTRACT_INTEGRITY: activate interaction "${interaction.key}" must have void valueType`,
      );
    }
    if (interaction.event === "change" && interaction.valueType === "void") {
      throw new Error(
        `V2_CONTRACT_INTEGRITY: change interaction "${interaction.key}" must carry a value`,
      );
    }
  }

  for (const child of node.children) {
    visitUiNode(child, ir);
  }
}
