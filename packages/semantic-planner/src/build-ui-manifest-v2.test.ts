import minimalDesignIrV2 from "../../design-normalizer/src/__fixtures__/minimal-design-ir-v2.json";

import type {
  DesignIRV2,
  NormalizationProvenanceV1,
  UiNodeV2,
} from "@uig/contracts";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { normalizePixsoDesignV2WithProvenance } from "../../design-normalizer/src/normalize-design.js";
import { buildUiManifestV2 } from "./build-ui-manifest-v2.js";

const designFixture = minimalDesignIrV2 as DesignIRV2;

describe("buildUiManifestV2", () => {
  it("emits an explicit layout anchor and activation interaction", () => {
    const manifest = buildUiManifestV2({
      ir: designFixture,
      provenance: provenanceFor(designFixture),
      exactMappings: [
        {
          componentKey: "Button/Primary",
          variant: "size=m",
          kind: "action",
          role: "primaryAction",
        },
      ],
    });

    expect(manifest.schema).toBe("ui-manifest/v2");
    expect(manifest.root.layoutSourceNodeId).toBe("4:314");
    expect(manifest.root.sourceNodeIds).toContain("4:315/0/0");
    expect(
      allNodes(manifest.root).every((node) => node.layoutSourceNodeId),
    ).toBe(true);
    expect(findRole(manifest.root, "primaryAction")?.interactions).toEqual([
      {
        key: "primaryAction",
        event: "activate",
        valueType: "void",
      },
    ]);
  });

  it("does not invent change interactions for an exact text input", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:316"]!.component = {
      key: "Field/Text",
      variant: "size=m",
    };

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "Field/Text",
          variant: "size=m",
          kind: "control",
          role: "textInput",
        },
      ],
    });

    expect(findRole(manifest.root, "textInput")?.interactions).toBeUndefined();
  });

  it("projects one visible direct placeholder from an exact text input", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:314"]!.component = { key: "Field/Text" };
    design.nodes["4:314"]!.children = ["4:319"];
    design.nodes["4:319"] = textNode("4:319", "Введите название", true);

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "Field/Text",
          kind: "control",
          role: "textInput",
        },
      ],
    });

    expect(manifest.root).toMatchObject({
      role: "textInput",
      content: { label: "Введите название" },
      sourceNodeIds: ["4:314", "4:319"],
      evidence: expect.arrayContaining([
        { kind: "direct-text-source-node", value: "4:319" },
        {
          kind: "direct-text-selection-rule",
          value: "single-visible-direct-text",
        },
      ]),
      children: [],
    });
  });

  it("does not choose a placeholder between multiple text-input children", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:314"]!.component = { key: "Field/Text" };
    design.nodes["4:314"]!.children = ["4:319", "4:320"];
    design.nodes["4:319"] = textNode("4:319", "Label", true);
    design.nodes["4:320"] = textNode("4:320", "Value", true);

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "Field/Text",
          kind: "control",
          role: "textInput",
        },
      ],
    });

    expect(manifest.root.content).toBeUndefined();
    expect(manifest.root.sourceNodeIds).toEqual(["4:314"]);
    expect(manifest.root.evidence).not.toContainEqual(
      expect.objectContaining({ kind: "direct-text-source-node" }),
    );
  });

  it("keeps an exactly recognized action group as a boundary", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:314"]!.component = { key: "ActionGroup" };

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "ActionGroup",
          kind: "group",
          role: "actionGroup",
        },
      ],
    });

    expect(manifest.root).toMatchObject({
      role: "actionGroup",
      layoutSourceNodeId: "4:314",
      children: [],
    });
    expect(manifest.root.interactions).toBeUndefined();
  });

  it("projects pack-declared exact action children with stable interactions", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:314"]!.component = { key: "ActionGroup" };
    design.nodes["4:314"]!.children = ["row"];
    design.nodes.row = groupNode("row", ["secondary", "primary"], 560, 40);
    design.nodes.secondary = groupNode(
      "secondary",
      ["secondary-label"],
      114,
      40,
      207,
    );
    design.nodes["secondary-label"] = textNode(
      "secondary-label",
      "Cancel",
      true,
    );
    design.nodes.primary = groupNode(
      "primary",
      ["primary-label"],
      231,
      40,
      329,
    );
    design.nodes["primary-label"] = textNode(
      "primary-label",
      "Confirm and finish",
      true,
    );

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "ActionGroup",
          kind: "group",
          role: "actionGroup",
          projection: {
            kind: "action-group",
            candidate: "button-shape-with-visible-label",
            order: "visual",
            roles: ["secondaryAction", "primaryAction"],
          },
        },
      ],
    });

    expect(findRole(manifest.root, "secondaryAction")).toMatchObject({
      content: { text: "Cancel", label: "Cancel" },
      sourceNodeIds: ["secondary", "secondary-label"],
      layoutSourceNodeId: "secondary",
      interactions: [
        { key: "secondaryAction", event: "activate", valueType: "void" },
      ],
    });
    expect(findRole(manifest.root, "primaryAction")).toMatchObject({
      content: {
        text: "Confirm and finish",
        label: "Confirm and finish",
      },
      sourceNodeIds: ["primary", "primary-label"],
      layoutSourceNodeId: "primary",
      interactions: [
        { key: "primaryAction", event: "activate", valueType: "void" },
      ],
    });
    expect(
      allNodes(manifest.root).some((node) => node.role === "unresolved"),
    ).toBe(false);
    expect(manifest.diagnostics).toEqual([]);
  });

  it("projects one visible direct text child with provenance from an exact content boundary", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:314"]!.component = { key: "ModalHeader" };
    design.nodes["4:314"]!.children = ["4:319", "4:320", "4:321"];
    design.nodes["4:319"] = textNode("4:319", "Hidden", false);
    design.nodes["4:320"] = textNode("4:320", "Modal title", true);
    design.nodes["4:321"] = {
      ...textNode("4:321", "Supporting copy", true),
      geometry: { x: 0, y: 28, width: 100, height: 16 },
    };

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "ModalHeader",
          kind: "content",
          role: "heading",
        },
      ],
    });

    expect(manifest.root).toMatchObject({
      role: "heading",
      content: { text: "Modal title", label: "Modal title" },
      sourceNodeIds: ["4:314", "4:320"],
      evidence: expect.arrayContaining([
        { kind: "direct-text-source-node", value: "4:320" },
        {
          kind: "direct-text-selection-rule",
          value: "unique-leading-typography-dominant-direct-text",
        },
      ]),
      children: [],
    });
  });

  it("projects a single visible direct text child with the single-child rule", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:314"]!.component = { key: "ModalHeader" };
    design.nodes["4:314"]!.children = ["4:319"];
    design.nodes["4:319"] = textNode("4:319", "Modal title", true);

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "ModalHeader",
          kind: "content",
          role: "heading",
        },
      ],
    });

    expect(manifest.root).toMatchObject({
      content: { text: "Modal title", label: "Modal title" },
      sourceNodeIds: ["4:314", "4:319"],
      evidence: expect.arrayContaining([
        {
          kind: "direct-text-selection-rule",
          value: "single-visible-direct-text",
        },
      ]),
    });
  });

  it("does not project a smaller leading eyebrow over a later dominant title", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:314"]!.component = { key: "ModalHeader" };
    design.nodes["4:314"]!.children = ["4:319", "4:320"];
    design.nodes["4:319"] = {
      ...textNode("4:319", "Eyebrow", true),
      geometry: { x: 0, y: 0, width: 100, height: 16 },
    };
    design.nodes["4:320"] = {
      ...textNode("4:320", "Modal title", true),
      geometry: { x: 0, y: 20, width: 100, height: 24 },
    };

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "ModalHeader",
          kind: "content",
          role: "heading",
        },
      ],
    });

    expect(manifest.root.content).toBeUndefined();
    expect(manifest.root.sourceNodeIds).toEqual(["4:314"]);
  });

  it("does not silently choose between multiple visible direct text children", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:314"]!.component = { key: "ModalHeader" };
    design.nodes["4:314"]!.children = ["4:319", "4:320"];
    design.nodes["4:319"] = textNode("4:319", "Modal title", true);
    design.nodes["4:320"] = textNode("4:320", "Supporting copy", true);

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "ModalHeader",
          kind: "content",
          role: "heading",
        },
      ],
    });

    expect(manifest.root.content).toBeUndefined();
    expect(manifest.root.sourceNodeIds).toEqual(["4:314"]);
    expect(manifest.root.evidence).not.toContainEqual(
      expect.objectContaining({ kind: "direct-text-source-node" }),
    );
  });

  it("does not invent content for an exact content boundary without one visible direct text child", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:314"]!.component = { key: "ModalHeader" };
    design.nodes["4:314"]!.children = ["4:319", "4:320"];
    design.nodes["4:319"] = {
      ...structuredClone(design.nodes["4:316"]!),
      id: "4:319",
      name: "Nested container",
      children: [],
      source: { provider: "pixso", nodeId: "4:319" },
    };
    design.nodes["4:320"] = textNode("4:320", "Hidden", false);

    const manifest = buildUiManifestV2({
      ir: design,
      provenance: provenanceFor(design),
      exactMappings: [
        {
          componentKey: "ModalHeader",
          kind: "content",
          role: "heading",
        },
      ],
    });

    expect(manifest.root.content).toBeUndefined();
    expect(manifest.root.sourceNodeIds).toEqual(["4:314"]);
  });

  it("blocks different semantic roles that normalize to one interaction key", () => {
    const design = structuredClone(designFixture);
    design.nodes["4:318"] = {
      ...structuredClone(design.nodes["4:316"]!),
      id: "4:318",
      name: "Secondary action",
      component: { key: "Button/Secondary", variant: "size=m" },
      source: { provider: "pixso", nodeId: "4:318" },
    };
    design.nodes["4:314"]!.children.push("4:318");

    expect(() =>
      buildUiManifestV2({
        ir: design,
        provenance: provenanceFor(design),
        exactMappings: [
          {
            componentKey: "Button/Primary",
            variant: "size=m",
            kind: "action",
            role: "primary-action",
          },
          {
            componentKey: "Button/Secondary",
            variant: "size=m",
            kind: "action",
            role: "primary_action",
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "SEMANTIC_INTERACTION_CONFLICT",
      }),
    );
  });

  it("rejects provenance from a different source artifact", () => {
    expect(() =>
      buildUiManifestV2({
        ir: designFixture,
        provenance: {
          ...provenanceFor(designFixture),
          sourceArtifactId: "different-artifact",
        },
        exactMappings: [],
      }),
    ).toThrow(/^V2_CONTRACT_INTEGRITY:/);
  });

  it("keeps an exact pack mapping authoritative over choice panel recognition", () => {
    const normalized = realChoicePanelNormalized();
    normalized.designIr.nodes[normalized.designIr.rootNodeId]!.component = {
      key: "Pack/ExactBoundary",
    };

    const manifest = buildUiManifestV2({
      ir: normalized.designIr,
      provenance: normalized.provenance,
      exactMappings: [
        {
          componentKey: "Pack/ExactBoundary",
          kind: "group",
          role: "packExactBoundary",
        },
      ],
    });

    expect(manifest.root).toMatchObject({
      kind: "group",
      role: "packExactBoundary",
      children: [],
    });
    expect(manifest.root.role).not.toBe("choicePanel");
  });

  it("keeps scalar traversal when a choice panel has meaningful unconsumed content", () => {
    const normalized = realChoicePanelNormalized();
    const root = normalized.designIr.nodes[normalized.designIr.rootNodeId]!;
    normalized.designIr.nodes.unexpected = {
      ...textNode("unexpected", "Непредусмотренное действие", true),
      geometry: { x: 40, y: 460, width: 260, height: 16 },
    };
    root.children.push("unexpected");

    const manifest = buildUiManifestV2({
      ir: normalized.designIr,
      provenance: normalized.provenance,
      exactMappings: [],
    });

    expect(manifest.root.role).not.toBe("choicePanel");
    expect(allNodes(manifest.root).length).toBeGreaterThan(1);
    expect(manifest.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CHOICE_PANEL_STRUCTURE_INCOMPLETE",
          blocking: true,
          evidence: expect.objectContaining({
            unconsumedMeaningfulNodeIds: expect.arrayContaining(["unexpected"]),
          }),
        }),
      ]),
    );
  });

  it("plans the real choice panel as one compound node without descendant blockers", () => {
    const normalized = realChoicePanelNormalized();

    const manifest = buildUiManifestV2({
      ir: normalized.designIr,
      provenance: normalized.provenance,
      exactMappings: [],
    });

    expect(manifest.root).toMatchObject({
      kind: "control",
      role: "choicePanel",
      sourceNodeIds: expect.arrayContaining(["70:118899"]),
      content: {
        sections: [{ options: [{}, {}, {}] }, { options: [{}, {}] }],
      },
      children: [],
    });
    expect(manifest.root.sourceNodeIds).toHaveLength(83);
    expect(manifest.diagnostics).toEqual([
      expect.objectContaining({
        code: "DUPLICATE_MATERIALIZED_NODE_COLLAPSED",
        blocking: false,
      }),
    ]);
    expect(manifest.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SEMANTIC_CONFIDENCE_TOO_LOW" }),
      ]),
    );
  });
});

function allNodes(root: UiNodeV2): UiNodeV2[] {
  return [root, ...root.children.flatMap(allNodes)];
}

function findRole(root: UiNodeV2, role: string): UiNodeV2 | undefined {
  return allNodes(root).find((node) => node.role === role);
}

function provenanceFor(ir: DesignIRV2): NormalizationProvenanceV1 {
  return {
    schema: "normalization-provenance/v1",
    sourceArtifactId: ir.sourceArtifactId,
    values: [],
  };
}

function realChoicePanelNormalized() {
  const rawDsl = JSON.parse(
    readFileSync(
      new URL(
        "../../../fixtures/pixso/node-70-118899/source.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as unknown;
  return normalizePixsoDesignV2WithProvenance({
    artifactId: "choice-panel-fixture",
    rootNodeId: "70:118899",
    rawDsl,
  });
}

function textNode(
  id: string,
  value: string,
  visible: boolean,
): DesignIRV2["nodes"][string] {
  return {
    id,
    type: "text",
    name: "",
    visible,
    children: [],
    geometry: { x: 0, y: 0, width: 100, height: 24 },
    appearance: {
      fills: [],
      borders: [],
      radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      shadows: [],
      opacity: 1,
    },
    text: { value },
    source: { provider: "pixso", nodeId: id },
  };
}

function groupNode(
  id: string,
  children: string[],
  width: number,
  height: number,
  x = 0,
): DesignIRV2["nodes"][string] {
  return {
    id,
    type: "frame",
    name: "",
    visible: true,
    children,
    geometry: { x, y: 0, width, height },
    appearance: {
      fills: [],
      borders: [],
      radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      shadows: [],
      opacity: 1,
    },
    source: { provider: "pixso", nodeId: id },
  };
}
