import type { Appearance, DesignIR, DesignNode } from "@uig/contracts";
import { stableStringify } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { buildDesignSummary } from "./build-design-summary.js";
import { queryDesignContext } from "./query-design-context.js";

const appearance: Appearance = {
  fills: [],
  borders: [],
  radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  shadows: [],
  opacity: 1,
};

function node(
  id: string,
  children: string[] = [],
  options: Partial<DesignNode> = {},
): DesignNode {
  return {
    id,
    type: "frame",
    name: id,
    visible: true,
    children,
    geometry: { x: 0, y: 0, width: 800, height: 600 },
    appearance,
    source: { provider: "pixso", nodeId: id },
    ...options,
  };
}

function largeIr(count = 1_000): DesignIR {
  const childIds = Array.from({ length: count }, (_, index) => `text-${index}`);
  const nodes: Record<string, DesignNode> = {
    root: node("root", childIds, { name: "Large screen" }),
  };
  childIds.forEach((id, index) => {
    nodes[id] = node(id, [], {
      type: "text",
      name: `Text ${index}`,
      geometry: { x: 0, y: index * 20, width: 400, height: 20 },
      text: { value: `Строка интерфейса ${index}` },
    });
  });
  return {
    schema: "design-ir/v1",
    sourceArtifactId: "pixso_doc_root_0123456789ab",
    dslVersion: "2.1.15",
    rootNodeId: "root",
    nodes,
    diagnostics: [],
  };
}

describe("buildDesignSummary", () => {
  it("is deterministic and remains within the default 20 KB budget", () => {
    const ir = largeIr();
    const first = buildDesignSummary({ ir });
    const second = buildDesignSummary({ ir });

    expect(Buffer.byteLength(stableStringify(first))).toBeLessThanOrEqual(
      20_000,
    );
    expect(stableStringify(first)).toBe(stableStringify(second));
    expect(first.truncated).toBe(true);
    expect(first.queryCursor).toMatch(/^[A-Za-z0-9_-]+$/);

    expect(() =>
      queryDesignContext(ir, {
        selector: "visible-tree",
        rootNodeId: "root",
        depth: 4,
        limit: 10,
        cursor: first.queryCursor!,
      }),
    ).not.toThrow();
  });

  it("supports an exact serialized byte limit", () => {
    const ir = largeIr(2);
    const full = buildDesignSummary({ ir, maxBytes: 100_000 });
    const exactBytes = Buffer.byteLength(stableStringify(full));

    expect(buildDesignSummary({ ir, maxBytes: exactBytes })).toEqual(full);
  });

  it("summarizes a one-node design without truncation", () => {
    const ir = largeIr(0);
    const summary = buildDesignSummary({ ir });

    expect(summary.outline).toEqual([
      {
        id: "root",
        depth: 0,
        type: "frame",
        name: "Large screen",
        childCount: 0,
      },
    ]);
    expect(summary.statistics).toEqual({
      nodeCount: 1,
      visibleNodeCount: 1,
      textNodeCount: 0,
      componentInstanceCount: 0,
    });
    expect(summary.truncated).toBe(false);
  });

  it("does not outline a hidden subtree", () => {
    const ir = largeIr(0);
    ir.nodes.root!.children = ["hidden"];
    ir.nodes.hidden = node("hidden", ["hidden-text"], { visible: false });
    ir.nodes["hidden-text"] = node("hidden-text", [], {
      type: "text",
      text: { value: "Invisible" },
    });

    const summary = buildDesignSummary({ ir });
    expect(summary.outline.map((entry) => entry.id)).toEqual(["root"]);
    expect(summary.statistics.nodeCount).toBe(3);
    expect(summary.statistics.visibleNodeCount).toBe(2);
  });

  it("limits the outline to the root at maxDepth 0", () => {
    const summary = buildDesignSummary({ ir: largeIr(3), maxDepth: 0 });

    expect(summary.outline.map((entry) => entry.id)).toEqual(["root"]);
  });

  it("rejects a byte budget smaller than the mandatory summary header", () => {
    expect(() =>
      buildDesignSummary({ ir: largeIr(1), maxBytes: 10 }),
    ).toThrowError(
      expect.objectContaining({
        name: "DesignSummaryError",
        code: "DESIGN_SUMMARY_LIMIT_TOO_SMALL",
      }),
    );
  });
});
