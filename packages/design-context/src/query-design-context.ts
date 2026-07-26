import type { Appearance, DesignIR, DesignNode } from "@uig/contracts";
import { stableStringify } from "@uig/contracts";

import { sha256 } from "./artifact-id.js";

export type DesignQuery =
  | { selector: "node"; nodeId: string }
  | {
      selector: "texts";
      rootNodeId?: string;
      limit: number;
      cursor?: string;
    }
  | {
      selector: "components";
      rootNodeId?: string;
      limit: number;
      cursor?: string;
    }
  | { selector: "styles"; nodeIds: string[] }
  | {
      selector: "visible-tree";
      rootNodeId: string;
      depth: number;
      limit: number;
      cursor?: string;
    };

export interface StyleQueryItem {
  id: string;
  appearance: Appearance;
}

export interface DesignQueryResult {
  selector: DesignQuery["selector"];
  items: Array<DesignNode | StyleQueryItem>;
  truncated: boolean;
  cursor?: string;
}

interface QueryCursor {
  selector: DesignQuery["selector"];
  offset: number;
  fingerprint: string;
}

export type DesignQueryErrorCode =
  | "DESIGN_QUERY_LIMIT_INVALID"
  | "DESIGN_QUERY_DEPTH_INVALID"
  | "DESIGN_QUERY_CURSOR_INVALID"
  | "DESIGN_QUERY_CURSOR_MISMATCH"
  | "DESIGN_QUERY_ROOT_NOT_FOUND";

export class DesignQueryError extends Error {
  readonly name = "DesignQueryError";

  constructor(
    readonly code: DesignQueryErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function queryDesignContext(
  ir: DesignIR,
  query: DesignQuery,
): DesignQueryResult {
  switch (query.selector) {
    case "node": {
      const selected = ir.nodes[query.nodeId];
      return {
        selector: query.selector,
        items: selected ? [selected] : [],
        truncated: false,
      };
    }

    case "styles":
      return {
        selector: query.selector,
        items: query.nodeIds.flatMap((id) => {
          const selected = ir.nodes[id];
          return selected
            ? [{ id: selected.id, appearance: selected.appearance }]
            : [];
        }),
        truncated: false,
      };

    case "texts": {
      const rootNodeId = query.rootNodeId ?? ir.rootNodeId;
      const items = documentOrder(ir, rootNodeId).filter(
        (item) => item.text !== undefined,
      );
      return paginate(ir, query, items, { rootNodeId });
    }

    case "components": {
      const rootNodeId = query.rootNodeId ?? ir.rootNodeId;
      const items = documentOrder(ir, rootNodeId).filter(
        (item) => item.component !== undefined,
      );
      return paginate(ir, query, items, { rootNodeId });
    }

    case "visible-tree": {
      if (!Number.isInteger(query.depth) || query.depth < 0) {
        throw new DesignQueryError(
          "DESIGN_QUERY_DEPTH_INVALID",
          "Visible-tree depth must be a non-negative integer",
        );
      }
      const items = visibleTree(ir, query.rootNodeId, query.depth);
      return paginate(ir, query, items, {
        rootNodeId: query.rootNodeId,
        depth: query.depth,
      });
    }
  }
}

function documentOrder(ir: DesignIR, rootNodeId: string): DesignNode[] {
  assertRoot(ir, rootNodeId);
  const ordered: DesignNode[] = [];
  const visited = new Set<string>();

  visit(ir, rootNodeId, visited, (item) => ordered.push(item));
  return ordered;
}

function visibleTree(
  ir: DesignIR,
  rootNodeId: string,
  maxDepth: number,
): DesignNode[] {
  assertRoot(ir, rootNodeId);
  const ordered: DesignNode[] = [];
  const visited = new Set<string>();

  const traverse = (nodeId: string, depth: number): void => {
    if (visited.has(nodeId) || depth > maxDepth) {
      return;
    }
    visited.add(nodeId);

    const current = ir.nodes[nodeId];
    if (!current || !current.visible) {
      return;
    }
    ordered.push(current);

    for (const childId of current.children) {
      traverse(childId, depth + 1);
    }
  };

  traverse(rootNodeId, 0);
  return ordered;
}

function visit(
  ir: DesignIR,
  nodeId: string,
  visited: Set<string>,
  onNode: (node: DesignNode) => void,
): void {
  if (visited.has(nodeId)) {
    return;
  }
  visited.add(nodeId);

  const current = ir.nodes[nodeId];
  if (!current) {
    return;
  }
  onNode(current);

  for (const childId of current.children) {
    visit(ir, childId, visited, onNode);
  }
}

function paginate(
  ir: DesignIR,
  query: Extract<
    DesignQuery,
    { selector: "texts" | "components" | "visible-tree" }
  >,
  items: DesignNode[],
  filters: Record<string, unknown>,
): DesignQueryResult {
  assertLimit(query.limit);
  const fingerprint = queryFingerprint(ir, query.selector, filters);
  const offset = query.cursor
    ? decodeCursor(query.cursor, query.selector, fingerprint).offset
    : 0;
  const page = items.slice(offset, offset + query.limit);
  const nextOffset = offset + page.length;
  const truncated = nextOffset < items.length;

  return {
    selector: query.selector,
    items: page,
    truncated,
    ...(truncated
      ? {
          cursor: encodeCursor({
            selector: query.selector,
            offset: nextOffset,
            fingerprint,
          }),
        }
      : {}),
  };
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new DesignQueryError(
      "DESIGN_QUERY_LIMIT_INVALID",
      "Query limit must be an integer from 1 to 500",
    );
  }
}

function assertRoot(ir: DesignIR, rootNodeId: string): void {
  if (!ir.nodes[rootNodeId]) {
    throw new DesignQueryError(
      "DESIGN_QUERY_ROOT_NOT_FOUND",
      `Design root node does not exist: ${rootNodeId}`,
    );
  }
}

function queryFingerprint(
  ir: DesignIR,
  selector: DesignQuery["selector"],
  filters: Record<string, unknown>,
): string {
  return sha256(
    stableStringify({
      filters,
      rootNodeId: ir.rootNodeId,
      schema: ir.schema,
      selector,
    }),
  );
}

function encodeCursor(cursor: QueryCursor): string {
  return Buffer.from(stableStringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(
  encoded: string,
  selector: QueryCursor["selector"],
  fingerprint: string,
): QueryCursor {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new DesignQueryError(
      "DESIGN_QUERY_CURSOR_INVALID",
      "Query cursor is not valid base64url JSON",
    );
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("selector" in value) ||
    !("offset" in value) ||
    !("fingerprint" in value) ||
    typeof value.selector !== "string" ||
    typeof value.offset !== "number" ||
    !Number.isInteger(value.offset) ||
    value.offset < 0 ||
    typeof value.fingerprint !== "string"
  ) {
    throw new DesignQueryError(
      "DESIGN_QUERY_CURSOR_INVALID",
      "Query cursor has an invalid shape",
    );
  }

  if (value.selector !== selector || value.fingerprint !== fingerprint) {
    throw new DesignQueryError(
      "DESIGN_QUERY_CURSOR_MISMATCH",
      "Query cursor does not belong to these filters",
    );
  }

  return value as QueryCursor;
}
