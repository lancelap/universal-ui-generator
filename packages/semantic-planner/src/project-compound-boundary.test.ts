import type {
  DesignIRV2,
  DesignNodeV2,
  PixsoSemanticMapping,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { projectCompoundBoundary } from "./project-compound-boundary.js";

const mapping: PixsoSemanticMapping = {
  componentKey: "ActionGroup",
  kind: "group",
  role: "actionGroup",
  projection: {
    kind: "action-group",
    candidate: "button-shape-with-visible-label",
    order: "visual",
    roles: ["secondaryAction", "primaryAction"],
  },
};

describe("projectCompoundBoundary", () => {
  it("projects two labeled button boundaries in visual order", () => {
    const design = actionGroupDesign();

    const result = projectCompoundBoundary({
      boundary: design.nodes.actions!,
      mapping,
      ir: design,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.children).toEqual([
      {
        kind: "action",
        role: "secondaryAction",
        boundaryNodeId: "secondary",
        labelNodeId: "secondary-label",
        label: "Cancel",
      },
      {
        kind: "action",
        role: "primaryAction",
        boundaryNodeId: "primary",
        labelNodeId: "primary-label",
        label: "Confirm and finish",
      },
    ]);
  });

  it("ignores decorative text nested below a direct icon child", () => {
    const design = actionGroupDesign();
    design.nodes["secondary"]!.children.unshift("secondary-icon");
    design.nodes["secondary-icon"] = node({
      id: "secondary-icon",
      type: "instance",
      width: 24,
      height: 24,
      children: ["secondary-icon-glyph"],
    });
    design.nodes["secondary-icon-glyph"] = textNode(
      "secondary-icon-glyph",
      "decorative glyph",
    );

    const result = projectCompoundBoundary({
      boundary: design.nodes.actions!,
      mapping,
      ir: design,
    });

    expect(result.children[0]).toMatchObject({
      labelNodeId: "secondary-label",
      label: "Cancel",
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("blocks an incomplete projection without inventing the missing role", () => {
    const design = actionGroupDesign();
    design.nodes.row!.children = ["primary"];
    delete design.nodes.secondary;
    delete design.nodes["secondary-label"];

    const result = projectCompoundBoundary({
      boundary: design.nodes.actions!,
      mapping,
      ir: design,
    });

    expect(result.children).toEqual([
      {
        kind: "action",
        role: "secondaryAction",
        boundaryNodeId: "primary",
        labelNodeId: "primary-label",
        label: "Confirm and finish",
      },
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        blocking: true,
        stage: "semantic-planning",
        code: "SEMANTIC_COMPOUND_PROJECTION_INCOMPLETE",
        source: {
          artifactId: design.sourceArtifactId,
          nodeId: "actions",
        },
        evidence: expect.objectContaining({
          expectedRoles: ["secondaryAction", "primaryAction"],
          acceptedCandidateNodeIds: ["primary"],
        }),
      }),
    );
  });

  it("rejects overlapping candidates and keeps a v1 mapping opaque", () => {
    const design = actionGroupDesign();
    design.nodes.primary!.geometry.x = 250;

    const overlap = projectCompoundBoundary({
      boundary: design.nodes.actions!,
      mapping,
      ir: design,
    });
    const opaque = projectCompoundBoundary({
      boundary: design.nodes.actions!,
      mapping: {
        componentKey: "ActionGroup",
        kind: "group",
        role: "actionGroup",
      },
      ir: design,
    });

    expect(overlap.children).toEqual([]);
    expect(overlap.diagnostics[0]).toMatchObject({
      code: "SEMANTIC_COMPOUND_PROJECTION_INCOMPLETE",
      blocking: true,
      evidence: {
        expectedRoles: ["secondaryAction", "primaryAction"],
        acceptedCandidateNodeIds: [],
        rejectedCandidates: expect.arrayContaining([
          expect.objectContaining({ nodeId: "secondary", reason: "overlap" }),
          expect.objectContaining({ nodeId: "primary", reason: "overlap" }),
        ]),
      },
    });
    expect(opaque).toEqual({ children: [], diagnostics: [] });
  });
});

function actionGroupDesign(): DesignIRV2 {
  return {
    schema: "design-ir/v2",
    sourceArtifactId: "pixso_fixture_actions",
    dslVersion: "2.1.15",
    rootNodeId: "actions",
    diagnostics: [],
    nodes: {
      actions: node({
        id: "actions",
        type: "instance",
        width: 560,
        height: 81,
        children: ["row"],
      }),
      row: node({
        id: "row",
        type: "frame",
        width: 560,
        height: 40,
        children: ["secondary", "primary"],
      }),
      secondary: node({
        id: "secondary",
        type: "symbol",
        x: 207,
        width: 114,
        height: 40,
        children: ["secondary-label"],
      }),
      "secondary-label": textNode("secondary-label", "Cancel"),
      primary: node({
        id: "primary",
        type: "symbol",
        x: 329,
        width: 231,
        height: 40,
        children: ["primary-label"],
      }),
      "primary-label": textNode("primary-label", "Confirm and finish"),
    },
  };
}

function textNode(id: string, value: string): DesignNodeV2 {
  return {
    ...node({ id, type: "text", width: 100, height: 16 }),
    text: { value },
  };
}

function node(input: {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  children?: string[];
}): DesignNodeV2 {
  return {
    id: input.id,
    type: input.type,
    name: "",
    visible: true,
    children: input.children ?? [],
    geometry: {
      x: input.x ?? 0,
      y: input.y ?? 0,
      width: input.width,
      height: input.height,
    },
    appearance: {
      fills: [],
      borders: [],
      radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      shadows: [],
      opacity: 1,
    },
    source: { provider: "pixso", nodeId: input.id },
  };
}
