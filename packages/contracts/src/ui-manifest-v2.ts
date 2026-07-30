import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import type { DesignIRV2 } from "./design-ir-v2.js";
import { DiagnosticSchema } from "./diagnostic.js";
import { closedObject, validateWithSchema } from "./schema-utils.js";
import { SemanticEvidenceSchema, UiNodeKindSchema } from "./ui-manifest.js";

export const ChoicePanelIconHintSchema = closedObject({
  hint: Type.String({ minLength: 1 }),
  sourceNodeId: Type.String({ minLength: 1 }),
});

export const ChoicePanelOptionSchema = closedObject({
  id: Type.String({ minLength: 1 }),
  sourceNodeIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  label: Type.String({ minLength: 1 }),
  labelSourceNodeId: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String({ minLength: 1 })),
  descriptionSourceNodeIds: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  ),
  info: Type.Optional(
    closedObject({
      present: Type.Literal(true),
      hint: Type.String({ minLength: 1 }),
      sourceNodeId: Type.String({ minLength: 1 }),
    }),
  ),
  selected: Type.Boolean(),
});

export const ChoicePanelSectionSchema = closedObject({
  id: Type.String({ minLength: 1 }),
  label: Type.Optional(Type.String({ minLength: 1 })),
  labelSourceNodeId: Type.Optional(Type.String({ minLength: 1 })),
  options: Type.Array(ChoicePanelOptionSchema),
});

export const ChoicePanelContentSchema = closedObject({
  title: Type.String({ minLength: 1 }),
  titleSourceNodeId: Type.String({ minLength: 1 }),
  headerIcon: Type.Optional(ChoicePanelIconHintSchema),
  sections: Type.Array(ChoicePanelSectionSchema, { minItems: 1 }),
});

export const ChoicePanelStateSchema = closedObject({
  selectionMode: Type.Literal("single"),
  selectedOptionId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
});

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
export type ChoicePanelIconHint = Static<typeof ChoicePanelIconHintSchema>;
export type ChoicePanelOption = Static<typeof ChoicePanelOptionSchema>;
export type ChoicePanelSection = Static<typeof ChoicePanelSectionSchema>;
export type ChoicePanelContent = Static<typeof ChoicePanelContentSchema>;
export type ChoicePanelState = Static<typeof ChoicePanelStateSchema>;
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

  if (node.role === "choicePanel") {
    try {
      const content = validateWithSchema(
        ChoicePanelContentSchema,
        node.content,
      );
      const state = validateWithSchema(ChoicePanelStateSchema, node.state);
      assertChoicePanelIntegrity(node, ir, content, state);
    } catch (error) {
      throw new Error(
        `V2_CONTRACT_INTEGRITY: invalid choicePanel "${node.id}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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

function assertChoicePanelIntegrity(
  node: UiNodeV2,
  ir: DesignIRV2,
  content: ChoicePanelContent,
  state: ChoicePanelState,
): void {
  const structuredSourceNodeIds = new Set<string>([content.titleSourceNodeId]);
  const sectionIds = new Set<string>();
  const optionIds = new Set<string>();
  const options: ChoicePanelOption[] = [];
  if (content.headerIcon) {
    structuredSourceNodeIds.add(content.headerIcon.sourceNodeId);
  }
  for (const section of content.sections) {
    if (sectionIds.has(section.id)) {
      throw new Error(`duplicate section ID "${section.id}"`);
    }
    sectionIds.add(section.id);
    if (Boolean(section.label) !== Boolean(section.labelSourceNodeId)) {
      throw new Error(
        `section "${section.id}" label and labelSourceNodeId must occur together`,
      );
    }
    if (section.labelSourceNodeId) {
      structuredSourceNodeIds.add(section.labelSourceNodeId);
    }
    for (const option of section.options) {
      if (optionIds.has(option.id)) {
        throw new Error(`duplicate option ID "${option.id}"`);
      }
      optionIds.add(option.id);
      options.push(option);
      if (
        Boolean(option.description) !== Boolean(option.descriptionSourceNodeIds)
      ) {
        throw new Error(
          `option "${option.id}" description and descriptionSourceNodeIds must occur together`,
        );
      }
      option.sourceNodeIds.forEach((sourceNodeId) =>
        structuredSourceNodeIds.add(sourceNodeId),
      );
      structuredSourceNodeIds.add(option.labelSourceNodeId);
      option.descriptionSourceNodeIds?.forEach((sourceNodeId) =>
        structuredSourceNodeIds.add(sourceNodeId),
      );
      if (option.info) {
        structuredSourceNodeIds.add(option.info.sourceNodeId);
      }
    }
  }

  if (options.length < 2) {
    throw new Error("choicePanel must contain at least two options");
  }

  const selectedOptions = options.filter((option) => option.selected);
  if (state.selectedOptionId === null) {
    if (selectedOptions.length > 0) {
      throw new Error(
        "choicePanel selected flags must be false when selectedOptionId is null",
      );
    }
  } else if (
    !optionIds.has(state.selectedOptionId) ||
    selectedOptions.length !== 1 ||
    selectedOptions[0]?.id !== state.selectedOptionId
  ) {
    throw new Error(
      `choicePanel selectedOptionId "${state.selectedOptionId}" does not match exactly one selected option`,
    );
  }

  for (const sourceNodeId of structuredSourceNodeIds) {
    if (!(sourceNodeId in ir.nodes)) {
      throw new Error(
        `structured source "${sourceNodeId}" is missing from DesignIR`,
      );
    }
    if (!node.sourceNodeIds.includes(sourceNodeId)) {
      throw new Error(
        `structured source "${sourceNodeId}" is not a source node of "${node.id}"`,
      );
    }
  }
}
