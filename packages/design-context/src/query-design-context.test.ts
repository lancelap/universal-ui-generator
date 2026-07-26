import type { Appearance, DesignIR, DesignNode } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import {
  DesignQueryError,
  queryDesignContext,
} from "./query-design-context.js";

const appearance: Appearance = {
  fills: [],
  borders: [],
  radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  shadows: [],
  opacity: 1,
};

function node(
  id: string,
  type: string,
  children: string[],
  options: Partial<DesignNode> = {},
): DesignNode {
  return {
    id,
    type,
    name: id,
    visible: true,
    children,
    geometry: { x: 0, y: 0, width: 100, height: 40 },
    appearance,
    source: { provider: "pixso", nodeId: id },
    ...options,
  };
}

const ir: DesignIR = {
  schema: "design-ir/v1",
  sourceArtifactId: "pixso_doc_1_0123456789ab",
  dslVersion: "2.1.15",
  rootNodeId: "root",
  nodes: {
    root: node("root", "frame", ["title", "card", "hidden"]),
    title: node("title", "text", [], {
      text: { value: "Заявка" },
    }),
    card: node("card", "component-instance", ["description"], {
      component: { key: "Card/Default", name: "Card" },
      appearance: {
        ...appearance,
        borders: [
          {
            position: "inside",
            width: { top: 1, right: 1, bottom: 1, left: 1 },
            style: "solid",
            color: "#D0D3D8",
            opacity: 1,
          },
        ],
      },
    }),
    description: node("description", "text", [], {
      text: { value: "Описание" },
    }),
    hidden: node("hidden", "frame", ["hidden-text"], { visible: false }),
    "hidden-text": node("hidden-text", "text", [], {
      text: { value: "Скрыто" },
    }),
  },
  diagnostics: [],
};

describe("bounded design-context queries", () => {
  it("returns exactly one requested node", () => {
    expect(
      queryDesignContext(ir, { selector: "node", nodeId: "card" }),
    ).toEqual({
      selector: "node",
      items: [ir.nodes.card],
      truncated: false,
    });
  });

  it("returns text nodes in stable document order", () => {
    const result = queryDesignContext(ir, {
      selector: "texts",
      limit: 10,
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "title",
      "description",
      "hidden-text",
    ]);
    expect(result.truncated).toBe(false);
  });

  it("paginates with an opaque cursor and resumes at the next item", () => {
    const first = queryDesignContext(ir, {
      selector: "texts",
      limit: 2,
    });

    expect(first.items.map((item) => item.id)).toEqual([
      "title",
      "description",
    ]);
    expect(first.truncated).toBe(true);
    expect(first.cursor).toEqual(expect.any(String));

    const second = queryDesignContext(ir, {
      selector: "texts",
      limit: 2,
      cursor: first.cursor!,
    });
    expect(second.items.map((item) => item.id)).toEqual(["hidden-text"]);
    expect(second.truncated).toBe(false);
    expect(second.cursor).toBeUndefined();
  });

  it.each([0, 501])("rejects an invalid limit of %s", (limit) => {
    expect(() =>
      queryDesignContext(ir, { selector: "texts", limit }),
    ).toThrowError(
      expect.objectContaining({
        name: "DesignQueryError",
        code: "DESIGN_QUERY_LIMIT_INVALID",
      }) as DesignQueryError,
    );
  });

  it("returns styles only for requested node IDs", () => {
    const result = queryDesignContext(ir, {
      selector: "styles",
      nodeIds: ["card", "title"],
    });

    expect(result.items).toEqual([
      { id: "card", appearance: ir.nodes.card?.appearance },
      { id: "title", appearance: ir.nodes.title?.appearance },
    ]);
  });

  it("excludes hidden nodes and their descendants from a visible tree", () => {
    const result = queryDesignContext(ir, {
      selector: "visible-tree",
      rootNodeId: "root",
      depth: 5,
      limit: 10,
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "root",
      "title",
      "card",
      "description",
    ]);
  });

  it("rejects a cursor when query filters change", () => {
    const first = queryDesignContext(ir, {
      selector: "visible-tree",
      rootNodeId: "root",
      depth: 1,
      limit: 1,
    });

    expect(() =>
      queryDesignContext(ir, {
        selector: "visible-tree",
        rootNodeId: "root",
        depth: 2,
        limit: 1,
        cursor: first.cursor!,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "DESIGN_QUERY_CURSOR_MISMATCH",
      }) as DesignQueryError,
    );
  });
});
