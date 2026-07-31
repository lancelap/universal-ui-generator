import type {
  DesignIRV2,
  DesignNodeV2,
  NormalizationProvenanceV1,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { extractChoicePanelCandidate } from "./choice-panel-candidates.js";

describe("extractChoicePanelCandidate", () => {
  it("extracts one provider-neutral single-selection section", () => {
    const { ir, provenance } = choicePanelFixture({
      sections: [[option("First", "First description"), option("Second")]],
    });

    const result = extractChoicePanelCandidate({
      ir,
      provenance,
      boundaryNodeId: ir.rootNodeId,
    });

    expect(result).toMatchObject({
      status: "candidate",
      candidate: {
        confidence: 0.91,
        content: {
          title: "Choose one",
          headerIcon: {
            hint: "files",
            sourceNodeId: "header-asset",
          },
          sections: [
            {
              options: [
                {
                  label: "First",
                  description: "First description",
                  selected: false,
                },
                {
                  label: "Second",
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
      },
    });
  });

  it("partitions ordered rows into two visual sections without splitting selection state", () => {
    const { ir, provenance } = choicePanelFixture({
      sections: [[option("First"), option("Second")], [option("Third")]],
    });

    const result = extractChoicePanelCandidate({
      ir,
      provenance,
      boundaryNodeId: ir.rootNodeId,
    });

    expect(result).toMatchObject({
      status: "candidate",
      candidate: {
        content: {
          sections: [
            { options: [{ label: "First" }, { label: "Second" }] },
            {
              label: "Section 2",
              options: [{ label: "Third" }],
            },
          ],
        },
        state: {
          selectionMode: "single",
          selectedOptionId: null,
        },
      },
    });
  });

  it("collapses an exactly overlapping duplicate only inside one description slot", () => {
    const { ir, provenance } = choicePanelFixture({
      sections: [[option("First", "Repeated description"), option("Second")]],
    });
    const duplicate = {
      ...structuredClone(ir.nodes["row-1-description"]!),
      id: "row-1-description-copy",
      source: { provider: "pixso" as const, nodeId: "row-1-description-copy" },
    };
    ir.nodes[duplicate.id] = duplicate;
    ir.nodes["row-1"]!.children.push(duplicate.id);

    const result = extractChoicePanelCandidate({
      ir,
      provenance,
      boundaryNodeId: ir.rootNodeId,
    });

    expect(result.status).toBe("candidate");
    if (result.status !== "candidate") {
      return;
    }
    expect(
      result.candidate.content.sections[0]!.options[0]!
        .descriptionSourceNodeIds,
    ).toEqual(["row-1-description", "row-1-description-copy"]);
    expect(result.candidate.diagnostics).toEqual([
      expect.objectContaining({
        code: "DUPLICATE_MATERIALIZED_NODE_COLLAPSED",
        blocking: false,
      }),
    ]);
  });

  it("rejects two competing interstitial section labels", () => {
    const { ir, provenance } = choicePanelFixture({
      sections: [[option("First")], [option("Second")]],
    });
    ir.nodes["competing-section-label"] = textNode(
      "competing-section-label",
      "Competing label",
      20,
      102,
      680,
      18,
    );
    const children = ir.nodes.root!.children;
    children.splice(
      children.indexOf("section-label-1") + 1,
      0,
      "competing-section-label",
    );

    expect(
      extractChoicePanelCandidate({
        ir,
        provenance,
        boundaryNodeId: ir.rootNodeId,
      }),
    ).toMatchObject({
      status: "none",
      reasons: expect.arrayContaining([
        expect.stringContaining("section label"),
      ]),
    });
  });

  it("is deterministic when DesignIR record insertion order changes", () => {
    const fixture = choicePanelFixture({
      sections: [[option("First"), option("Second")]],
    });
    const reversed = {
      ...fixture.ir,
      nodes: Object.fromEntries(Object.entries(fixture.ir.nodes).reverse()),
    };

    const first = extractChoicePanelCandidate({
      ir: fixture.ir,
      provenance: fixture.provenance,
      boundaryNodeId: fixture.ir.rootNodeId,
    });
    const second = extractChoicePanelCandidate({
      ir: reversed,
      provenance: fixture.provenance,
      boundaryNodeId: reversed.rootNodeId,
    });

    expect(second).toEqual(first);
  });

  it("consumes implementation descendants under a hidden option boundary", () => {
    const { ir, provenance } = choicePanelFixture({
      sections: [[option("First"), option("Second"), option("Hidden")]],
    });
    ir.nodes["row-3"]!.visible = false;
    ir.nodes["row-3-info"]!.visible = false;

    const result = extractChoicePanelCandidate({
      ir,
      provenance,
      boundaryNodeId: ir.rootNodeId,
    });

    expect(result).toMatchObject({
      status: "candidate",
      candidate: {
        content: {
          sections: [{ options: [{ label: "First" }, { label: "Second" }] }],
        },
        implementationNodeIds: expect.arrayContaining([
          "row-3",
          "row-3-marker",
          "row-3-label",
          "row-3-info",
        ]),
      },
    });
  });

  it("reports unrelated visible text as meaningful and unconsumed", () => {
    const { ir, provenance } = choicePanelFixture({
      sections: [[option("First"), option("Second")]],
    });
    ir.nodes.unrelated = textNode(
      "unrelated",
      "Unrelated content",
      20,
      160,
      500,
      18,
    );
    ir.nodes.root!.children.push("unrelated");

    const result = extractChoicePanelCandidate({
      ir,
      provenance,
      boundaryNodeId: ir.rootNodeId,
    });

    expect(result).toMatchObject({
      status: "candidate",
      candidate: {
        unconsumedMeaningfulNodeIds: ["unrelated"],
      },
    });
  });
});

interface OptionFixture {
  label: string;
  description?: string;
}

function option(label: string, description?: string): OptionFixture {
  return { label, ...(description ? { description } : {}) };
}

function choicePanelFixture(input: { sections: OptionFixture[][] }): {
  ir: DesignIRV2;
  provenance: NormalizationProvenanceV1;
} {
  const nodes: Record<string, DesignNodeV2> = {};
  const rootChildren = ["header-asset", "title"];
  nodes["header-asset"] = node("header-asset", "symbol", 20, 20, 24, 24, {
    asset: { name: "files" },
  });
  nodes.title = textNode("title", "Choose one", 52, 22, 300, 20);

  let y = 70;
  let optionIndex = 0;
  input.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) {
      const sectionId = `section-label-${sectionIndex}`;
      rootChildren.push(sectionId);
      nodes[sectionId] = textNode(
        sectionId,
        `Section ${sectionIndex + 1}`,
        20,
        y,
        680,
        18,
      );
      y += 30;
    }
    for (const value of section) {
      optionIndex += 1;
      const rowId = `row-${optionIndex}`;
      const markerId = `${rowId}-marker`;
      const labelId = `${rowId}-label`;
      const descriptionId = `${rowId}-description`;
      const infoId = `${rowId}-info`;
      const rowChildren = [markerId, labelId];
      nodes[markerId] = node(markerId, "ellipse", 20, y, 16, 16);
      nodes[labelId] = textNode(labelId, value.label, 44, y, 500, 16);
      if (value.description) {
        rowChildren.push(descriptionId);
        nodes[descriptionId] = textNode(
          descriptionId,
          value.description,
          44,
          y + 20,
          600,
          16,
        );
      }
      nodes[rowId] = node(
        rowId,
        "frame",
        20,
        y,
        668,
        value.description ? 38 : 18,
        { children: rowChildren },
      );
      nodes[infoId] = node(infoId, "symbol", 688, y, 24, 24);
      rootChildren.push(rowId, infoId);
      y += value.description ? 50 : 30;
    }
  });

  nodes.root = node("root", "frame", 0, 0, 752, y + 20, {
    children: rootChildren,
    layout: {
      mode: "vertical",
      gap: 0,
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
      alignItems: "stretch",
    },
    appearance: {
      fills: [],
      borders: [
        {
          position: "inside",
          width: { top: 1, right: 1, bottom: 1, left: 1 },
          style: "solid",
          color: "#000000",
          opacity: 0.2,
        },
      ],
      radii: {
        topLeft: 16,
        topRight: 16,
        bottomRight: 16,
        bottomLeft: 16,
      },
      shadows: [],
      opacity: 1,
    },
  });

  return {
    ir: {
      schema: "design-ir/v2",
      sourceArtifactId: "fixture-artifact",
      dslVersion: "test",
      rootNodeId: "root",
      nodes,
      diagnostics: [],
    },
    provenance: {
      schema: "normalization-provenance/v1",
      sourceArtifactId: "fixture-artifact",
      values: [],
    },
  };
}

function textNode(
  id: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
): DesignNodeV2 {
  return node(id, "text", x, y, width, height, { text: { value } });
}

function node(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  overrides: Partial<DesignNodeV2> = {},
): DesignNodeV2 {
  return {
    id,
    type,
    name: "",
    visible: true,
    children: [],
    geometry: { x, y, width, height },
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
    source: { provider: "pixso", nodeId: id },
    ...overrides,
  };
}
