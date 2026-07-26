import minimalDesignIr from "./__fixtures__/minimal-design-ir.json";
import minimalDesignIrV2 from "./__fixtures__/minimal-design-ir-v2.json";
import minimalPixsoDsl from "./__fixtures__/minimal-pixso-dsl.json";

import { stableStringify } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import {
  normalizePixsoDesign,
  normalizePixsoDesignV2,
} from "./normalize-design.js";

const artifactId = "pixso_doc_4_314_0123456789ab";

function fixtureRoot(): Record<string, unknown> & {
  childNode: unknown[];
} {
  return structuredClone(
    minimalPixsoDsl.dsl.pixTreeDslNodes[0]!,
  ) as unknown as Record<string, unknown> & {
    childNode: unknown[];
  };
}

describe("normalizePixsoDesign", () => {
  it("normalizes visual facts into a deterministic golden DesignIR", () => {
    const result = normalizePixsoDesign({
      artifactId,
      rawDsl: minimalPixsoDsl,
    });

    expect(stableStringify(result)).toBe(stableStringify(minimalDesignIr));
    expect(result.nodes["4:317"]?.visible).toBe(false);
  });

  it.each([
    null,
    [],
    "not an object",
    { dsl: { ...minimalPixsoDsl.dsl, dslVersion: undefined } },
  ])("rejects an unsupported envelope", (rawDsl) => {
    expect(() => normalizePixsoDesign({ artifactId, rawDsl })).toThrowError(
      expect.objectContaining({
        name: "DesignNormalizationError",
        code: "DESIGN_DSL_UNSUPPORTED",
      }),
    );
  });

  it("rejects duplicate normalized node IDs", () => {
    const root = fixtureRoot();
    (root.childNode[1] as Record<string, unknown>).guid = "4:314";

    expect(() =>
      normalizePixsoDesign({
        artifactId,
        rawDsl: {
          dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "DESIGN_DSL_UNSUPPORTED",
      }),
    );
  });

  it("selects the requested design root when Pixso includes dependency roots", () => {
    const dependency = fixtureRoot();
    dependency.guid = "dependency-root";
    dependency.name = "Exported dependency";
    const requested = fixtureRoot();

    const result = normalizePixsoDesign({
      artifactId,
      rootNodeId: "4:314",
      rawDsl: {
        dsl: {
          ...minimalPixsoDsl.dsl,
          pixTreeDslNodes: [dependency, requested],
        },
      },
    });

    expect(result.rootNodeId).toBe("4:314");
    expect(result.nodes["dependency-root"]).toBeUndefined();
  });

  it("rejects multiple Pixso design roots without an explicit selector", () => {
    expect(() =>
      normalizePixsoDesign({
        artifactId,
        rawDsl: {
          dsl: {
            ...minimalPixsoDsl.dsl,
            pixTreeDslNodes: [fixtureRoot(), fixtureRoot()],
          },
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "DESIGN_DSL_UNSUPPORTED",
        message: expect.stringContaining("rootNodeId"),
      }),
    );
  });

  it("assigns contextual IDs to repeated guidless component override nodes", () => {
    const root = fixtureRoot();
    const override = {
      componentId: "Component/Row",
      pathString: "Component/Row",
      type: "SYMBOL",
      name: "Row item",
      left: 0,
      top: 0,
      width: 100,
      height: 20,
    };
    root.props = [structuredClone(override), structuredClone(override)];

    const result = normalizePixsoDesign({
      artifactId,
      rawDsl: {
        dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
      },
    });

    expect(result.nodes["4:314"]?.children).toContain("Component/Row");
    expect(result.nodes["4:314"]?.children).toContain("Component/Row@4:314/4");
  });

  it("ignores non-visual Pixso property overrides without geometry", () => {
    const root = fixtureRoot();
    root.props = [
      {
        componentId: "Component/Text",
        pathString: "Instance/Component/Text",
        type: "TEXT",
        nodeText: "Property override only",
      },
    ];

    const result = normalizePixsoDesign({
      artifactId,
      rawDsl: {
        dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
      },
    });

    expect(result.nodes["4:314"]?.children).toHaveLength(3);
    expect(
      result.nodes["Component/Text/Instance/Component/Text"],
    ).toBeUndefined();
  });

  it("rejects non-finite geometry", () => {
    const root = fixtureRoot();
    root.width = Number.POSITIVE_INFINITY;

    expect(() =>
      normalizePixsoDesign({
        artifactId,
        rawDsl: {
          dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "DESIGN_DSL_UNSUPPORTED",
      }),
    );
  });

  it("preserves an unsupported paint as a non-blocking diagnostic", () => {
    const root = fixtureRoot();
    root.fills = [{ type: "NOISE", visible: true }];

    const result = normalizePixsoDesign({
      artifactId,
      rawDsl: {
        dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
      },
    });

    expect(result.nodes["4:314"]?.appearance.fills).toEqual([
      { type: "unsupported", opacity: 1 },
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "DESIGN_PAINT_UNSUPPORTED",
        blocking: false,
        source: { artifactId, nodeId: "4:314" },
      }),
    );
  });

  it("rejects a missing referenced child", () => {
    const root = fixtureRoot();
    root.childNode.push("missing-node");

    expect(() =>
      normalizePixsoDesign({
        artifactId,
        rawDsl: {
          dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "DESIGN_NODE_REFERENCE_MISSING",
      }),
    );
  });
});

describe("normalizePixsoDesignV2 positioning", () => {
  it("normalizes the committed positioning fixture into a deterministic golden", () => {
    const result = normalizePixsoDesignV2({
      artifactId,
      rawDsl: minimalPixsoDsl,
    });

    expect(stableStringify(result)).toBe(stableStringify(minimalDesignIrV2));
  });

  it("leaves position absent when Pixso provides no positioning fact", () => {
    const root = fixtureRoot();
    const child = root.childNode[0] as Record<string, unknown>;
    delete child.autoLayoutAbsolutePos;

    const result = normalizePixsoDesignV2({
      artifactId,
      rawDsl: {
        dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
      },
    });

    expect(result.nodes["4:315/0/0"]?.position).toBeUndefined();
  });

  it("normalizes an explicit auto-layout item as flow", () => {
    const root = fixtureRoot();
    const child = root.childNode[0] as Record<string, unknown>;
    child.autoLayoutAbsolutePos = false;

    const result = normalizePixsoDesignV2({
      artifactId,
      rawDsl: {
        dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
      },
    });

    expect(result.nodes["4:315/0/0"]?.position).toEqual({ mode: "flow" });
  });

  it("normalizes explicit absolute positioning with source top and left", () => {
    const root = fixtureRoot();
    const child = root.childNode[1] as Record<string, unknown>;
    child.autoLayoutAbsolutePos = true;

    const result = normalizePixsoDesignV2({
      artifactId,
      rawDsl: {
        dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
      },
    });

    expect(result.nodes["4:316"]?.position).toEqual({
      mode: "absolute",
      inset: { top: 320, left: 32 },
    });
  });

  it("rejects malformed explicit absolute insets", () => {
    const root = fixtureRoot();
    const child = root.childNode[1] as Record<string, unknown>;
    child.autoLayoutAbsolutePos = true;
    child.top = Number.POSITIVE_INFINITY;

    expect(() =>
      normalizePixsoDesignV2({
        artifactId,
        rawDsl: {
          dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "DESIGN_DSL_UNSUPPORTED",
      }),
    );
  });

  it("does not infer absolute positioning from overlapping coordinates", () => {
    const root = fixtureRoot();
    const first = root.childNode[0] as Record<string, unknown>;
    const second = root.childNode[1] as Record<string, unknown>;
    delete first.autoLayoutAbsolutePos;
    delete second.autoLayoutAbsolutePos;
    second.left = first.left;
    second.top = first.top;

    const result = normalizePixsoDesignV2({
      artifactId,
      rawDsl: {
        dsl: { ...minimalPixsoDsl.dsl, pixTreeDslNodes: [root] },
      },
    });

    expect(result.nodes["4:315/0/0"]?.position).toBeUndefined();
    expect(result.nodes["4:316"]?.position).toBeUndefined();
  });
});
