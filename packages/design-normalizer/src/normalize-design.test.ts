import minimalDesignIr from "./__fixtures__/minimal-design-ir.json";
import minimalPixsoDsl from "./__fixtures__/minimal-pixso-dsl.json";

import { stableStringify } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { normalizePixsoDesign } from "./normalize-design.js";

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
    (root.childNode[1] as Record<string, unknown>).guid = "4:315";

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
