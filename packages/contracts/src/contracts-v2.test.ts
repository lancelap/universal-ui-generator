import { describe, expect, it } from "vitest";

import {
  type ChoicePanelContent,
  type ChoicePanelState,
  ContractValidationError,
  type DesignIRV2,
  DesignIRV2Schema,
  type UiInteraction,
  type UiManifestV2,
  UiManifestSchema,
  UiManifestV2Schema,
  assertDesignIRV2Integrity,
  assertUiManifestV2Integrity,
  validateWithSchema,
} from "./index.js";

const activateInteraction: UiInteraction = {
  key: "confirm",
  event: "activate",
  valueType: "void",
};

const designIrV2Fixture: DesignIRV2 = {
  schema: "design-ir/v2",
  sourceArtifactId: "pixso_file_4-314_a81f9c",
  dslVersion: "2.1.15",
  rootNodeId: "4:314",
  nodes: {
    "4:314": {
      id: "4:314",
      type: "frame",
      name: "Modal",
      visible: true,
      children: ["4:315"],
      geometry: { x: 0, y: 0, width: 600, height: 267 },
      layout: {
        mode: "vertical",
        gap: 16,
        padding: { top: 24, right: 24, bottom: 24, left: 24 },
        alignItems: "stretch",
      },
      position: { mode: "flow" },
      appearance: {
        fills: [],
        borders: [],
        radii: {
          topLeft: 0,
          topRight: 0,
          bottomRight: 0,
          bottomLeft: 0,
        },
        shadows: [],
        opacity: 1,
      },
      source: { provider: "pixso", nodeId: "4:314" },
    },
    "4:315": {
      id: "4:315",
      type: "text",
      name: "Title",
      visible: true,
      children: [],
      geometry: { x: 24, y: 24, width: 200, height: 24 },
      position: {
        mode: "absolute",
        inset: { top: 24, left: 24 },
      },
      appearance: {
        fills: [],
        borders: [],
        radii: {
          topLeft: 0,
          topRight: 0,
          bottomRight: 0,
          bottomLeft: 0,
        },
        shadows: [],
        opacity: 1,
      },
      text: { value: "Title" },
      source: { provider: "pixso", nodeId: "4:315" },
    },
  },
  diagnostics: [],
};

const uiManifestV2Fixture: UiManifestV2 = {
  schema: "ui-manifest/v2",
  sourceArtifactId: designIrV2Fixture.sourceArtifactId,
  root: {
    id: "ui_dialog_4-314",
    kind: "overlay",
    role: "dialog",
    sourceNodeIds: ["4:314"],
    layoutSourceNodeId: "4:314",
    confidence: 1,
    evidence: [{ kind: "exact-component", value: "modal-key" }],
    interactions: [activateInteraction],
    children: [
      {
        id: "ui_title_4-315",
        kind: "content",
        role: "heading",
        sourceNodeIds: ["4:315"],
        layoutSourceNodeId: "4:315",
        confidence: 1,
        evidence: [{ kind: "text", value: "Title" }],
        children: [],
      },
    ],
  },
  diagnostics: [],
};

const uiManifestV1Fixture = {
  schema: "ui-manifest/v1",
  sourceArtifactId: designIrV2Fixture.sourceArtifactId,
  root: {
    id: "ui_dialog_4-314",
    kind: "overlay",
    role: "dialog",
    sourceNodeIds: ["4:314"],
    confidence: 1,
    evidence: [],
    children: [],
  },
  diagnostics: [],
} as const;

const choicePanelDesignIrV2Fixture: DesignIRV2 = {
  ...designIrV2Fixture,
  nodes: {
    ...designIrV2Fixture.nodes,
    "4:316": {
      ...designIrV2Fixture.nodes["4:315"]!,
      id: "4:316",
      geometry: { x: 48, y: 80, width: 200, height: 24 },
      text: { value: "First option" },
      source: { provider: "pixso", nodeId: "4:316" },
    },
    "4:317": {
      ...designIrV2Fixture.nodes["4:315"]!,
      id: "4:317",
      geometry: { x: 48, y: 120, width: 200, height: 24 },
      text: { value: "Second option" },
      source: { provider: "pixso", nodeId: "4:317" },
    },
  },
};

const choicePanelManifestV2Fixture: UiManifestV2 = {
  schema: "ui-manifest/v2",
  sourceArtifactId: choicePanelDesignIrV2Fixture.sourceArtifactId,
  root: {
    id: "ui_choice_panel_4-314",
    kind: "control",
    role: "choicePanel",
    sourceNodeIds: ["4:314", "4:315", "4:316", "4:317"],
    layoutSourceNodeId: "4:314",
    confidence: 0.8,
    evidence: [{ kind: "structure", value: "single-selection-collection" }],
    content: {
      title: "Choose an option",
      titleSourceNodeId: "4:315",
      sections: [
        {
          id: "section-4-316",
          options: [
            {
              id: "option-4-316",
              sourceNodeIds: ["4:316"],
              label: "First option",
              labelSourceNodeId: "4:316",
              selected: false,
            },
            {
              id: "option-4-317",
              sourceNodeIds: ["4:317"],
              label: "Second option",
              labelSourceNodeId: "4:317",
              selected: false,
            },
          ],
        },
      ],
    },
    state: {
      selectionMode: "single",
      selectedOptionId: null,
    },
    children: [],
  },
  diagnostics: [],
};

function cloneChoicePanelManifest(): UiManifestV2 {
  return structuredClone(choicePanelManifestV2Fixture);
}

function choicePanelContent(manifest: UiManifestV2): ChoicePanelContent {
  return manifest.root.content as ChoicePanelContent;
}

function choicePanelState(manifest: UiManifestV2): ChoicePanelState {
  return manifest.root.state as ChoicePanelState;
}

describe("v2 design and manifest contracts", () => {
  it("validates explicit positioning and interactions", () => {
    expect(validateWithSchema(DesignIRV2Schema, designIrV2Fixture)).toEqual(
      designIrV2Fixture,
    );
    expect(validateWithSchema(UiManifestV2Schema, uiManifestV2Fixture)).toEqual(
      uiManifestV2Fixture,
    );
  });

  it("rejects an interaction with an unknown event", () => {
    expect(() =>
      validateWithSchema(UiManifestV2Schema, {
        ...uiManifestV2Fixture,
        root: {
          ...uiManifestV2Fixture.root,
          interactions: [
            {
              ...activateInteraction,
              event: "submit",
            },
          ],
        },
      }),
    ).toThrowError(ContractValidationError);
  });

  it("keeps v1 readable without accepting it as v2", () => {
    expect(validateWithSchema(UiManifestSchema, uiManifestV1Fixture)).toEqual(
      uiManifestV1Fixture,
    );
    expect(() =>
      validateWithSchema(UiManifestV2Schema, uiManifestV1Fixture),
    ).toThrowError(ContractValidationError);
  });

  it("rejects a missing design root", () => {
    expect(() =>
      assertDesignIRV2Integrity({
        ...designIrV2Fixture,
        rootNodeId: "missing",
      }),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects a missing manifest source anchor", () => {
    expect(() =>
      assertUiManifestV2Integrity(
        {
          ...uiManifestV2Fixture,
          root: {
            ...uiManifestV2Fixture.root,
            layoutSourceNodeId: "4:999",
          },
        },
        designIrV2Fixture,
      ),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects a layout source outside the node source IDs", () => {
    expect(() =>
      assertUiManifestV2Integrity(
        {
          ...uiManifestV2Fixture,
          root: {
            ...uiManifestV2Fixture.root,
            layoutSourceNodeId: "4:315",
          },
        },
        designIrV2Fixture,
      ),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects duplicate interaction keys within one node", () => {
    expect(() =>
      assertUiManifestV2Integrity(
        {
          ...uiManifestV2Fixture,
          root: {
            ...uiManifestV2Fixture.root,
            interactions: [activateInteraction, activateInteraction],
          },
        },
        designIrV2Fixture,
      ),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects non-void activate interactions", () => {
    expect(() =>
      assertUiManifestV2Integrity(
        {
          ...uiManifestV2Fixture,
          root: {
            ...uiManifestV2Fixture.root,
            interactions: [
              {
                ...activateInteraction,
                valueType: "string",
              },
            ],
          },
        },
        designIrV2Fixture,
      ),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects void change interactions", () => {
    expect(() =>
      assertUiManifestV2Integrity(
        {
          ...uiManifestV2Fixture,
          root: {
            ...uiManifestV2Fixture.root,
            interactions: [
              {
                ...activateInteraction,
                event: "change",
              },
            ],
          },
        },
        designIrV2Fixture,
      ),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects unknown choice-panel content fields", () => {
    expect(() =>
      assertUiManifestV2Integrity(
        {
          ...choicePanelManifestV2Fixture,
          root: {
            ...choicePanelManifestV2Fixture.root,
            content: {
              ...choicePanelManifestV2Fixture.root.content,
              unsupported: true,
            },
          },
        },
        choicePanelDesignIrV2Fixture,
      ),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects a choice-panel structured source missing from DesignIR", () => {
    expect(() =>
      assertUiManifestV2Integrity(
        {
          ...choicePanelManifestV2Fixture,
          root: {
            ...choicePanelManifestV2Fixture.root,
            content: {
              ...choicePanelManifestV2Fixture.root.content,
              titleSourceNodeId: "missing-title",
            },
          },
        },
        choicePanelDesignIrV2Fixture,
      ),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects a choice-panel structured source outside its source closure", () => {
    expect(() =>
      assertUiManifestV2Integrity(
        {
          ...choicePanelManifestV2Fixture,
          root: {
            ...choicePanelManifestV2Fixture.root,
            sourceNodeIds: ["4:314", "4:316", "4:317"],
          },
        },
        choicePanelDesignIrV2Fixture,
      ),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects a choice panel with fewer than two total options", () => {
    const manifest = cloneChoicePanelManifest();
    choicePanelContent(manifest).sections[0]!.options.splice(1);

    expect(() =>
      assertUiManifestV2Integrity(manifest, choicePanelDesignIrV2Fixture),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects duplicate choice-panel section IDs", () => {
    const manifest = cloneChoicePanelManifest();
    const content = choicePanelContent(manifest);
    const secondOption = content.sections[0]!.options.pop()!;
    content.sections.push({
      id: content.sections[0]!.id,
      options: [secondOption],
    });

    expect(() =>
      assertUiManifestV2Integrity(manifest, choicePanelDesignIrV2Fixture),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects duplicate choice-panel option IDs", () => {
    const manifest = cloneChoicePanelManifest();
    const options = choicePanelContent(manifest).sections[0]!.options;
    options[1]!.id = options[0]!.id;

    expect(() =>
      assertUiManifestV2Integrity(manifest, choicePanelDesignIrV2Fixture),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects an unknown selected choice-panel option", () => {
    const manifest = cloneChoicePanelManifest();
    choicePanelState(manifest).selectedOptionId = "missing-option";

    expect(() =>
      assertUiManifestV2Integrity(manifest, choicePanelDesignIrV2Fixture),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects choice-panel selected flags that disagree with state", () => {
    const manifest = cloneChoicePanelManifest();
    choicePanelState(manifest).selectedOptionId = "option-4-316";

    expect(() =>
      assertUiManifestV2Integrity(manifest, choicePanelDesignIrV2Fixture),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects a choice-panel description without source provenance", () => {
    const manifest = cloneChoicePanelManifest();
    choicePanelContent(manifest).sections[0]!.options[0]!.description =
      "Description";

    expect(() =>
      assertUiManifestV2Integrity(manifest, choicePanelDesignIrV2Fixture),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("rejects a choice-panel section label without a source", () => {
    const manifest = cloneChoicePanelManifest();
    choicePanelContent(manifest).sections[0]!.label = "Later choices";

    expect(() =>
      assertUiManifestV2Integrity(manifest, choicePanelDesignIrV2Fixture),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("applies choice-panel option cardinality across all sections", () => {
    const manifest = cloneChoicePanelManifest();
    choicePanelContent(manifest).sections.push({
      id: "empty-visual-section",
      options: [],
    });

    expect(() =>
      assertUiManifestV2Integrity(manifest, choicePanelDesignIrV2Fixture),
    ).not.toThrow();
  });

  it("accepts internally consistent artifacts", () => {
    expect(() => assertDesignIRV2Integrity(designIrV2Fixture)).not.toThrow();
    expect(() =>
      assertUiManifestV2Integrity(uiManifestV2Fixture, designIrV2Fixture),
    ).not.toThrow();
    expect(() =>
      assertUiManifestV2Integrity(
        choicePanelManifestV2Fixture,
        choicePanelDesignIrV2Fixture,
      ),
    ).not.toThrow();
  });
});
