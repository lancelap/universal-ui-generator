import type { DesignIR, DesignNode, DesignSummary } from "@uig/contracts";
import { stableStringify } from "@uig/contracts";

import { createVisibleTreeCursor } from "./query-design-context.js";

const DEFAULT_MAX_BYTES = 20_000;
const DEFAULT_MAX_DEPTH = 4;

type OutlineEntry = DesignSummary["outline"][number];
type NotableEntry = DesignSummary["notableNodes"][number];

export class DesignSummaryError extends Error {
  readonly name = "DesignSummaryError";

  constructor(
    readonly code: "DESIGN_SUMMARY_LIMIT_TOO_SMALL",
    message: string,
  ) {
    super(message);
  }
}

export function buildDesignSummary(input: {
  ir: DesignIR;
  maxBytes?: number;
  maxDepth?: number;
}): DesignSummary {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw limitTooSmall(maxBytes);
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new RangeError("Design summary maxDepth must be non-negative");
  }

  const root = input.ir.nodes[input.ir.rootNodeId];
  if (!root) {
    throw new Error(`Design root node does not exist: ${input.ir.rootNodeId}`);
  }

  const documentNodes = documentOrder(input.ir);
  const outline = visibleOutline(input.ir, root.id, maxDepth);
  const notableNodes = notableEntries(documentNodes);
  const base = summaryBase(input.ir, root, documentNodes);
  const compose = (
    selectedOutline: OutlineEntry[],
    selectedNotable: NotableEntry[],
    truncated: boolean,
  ): DesignSummary => ({
    ...base,
    outline: selectedOutline,
    notableNodes: selectedNotable,
    truncated,
    ...(truncated
      ? {
          queryCursor: createVisibleTreeCursor(input.ir, {
            rootNodeId: root.id,
            depth: maxDepth,
            offset: selectedOutline.length,
          }),
        }
      : {}),
  });

  const full = compose(outline, notableNodes, false);
  if (serializedBytes(full) <= maxBytes) {
    return full;
  }

  const mandatory = compose([], [], true);
  if (serializedBytes(mandatory) > maxBytes) {
    throw limitTooSmall(maxBytes);
  }

  const selectedOutline: OutlineEntry[] = [];
  for (const entry of outline) {
    const trial = compose([...selectedOutline, entry], [], true);
    if (serializedBytes(trial) > maxBytes) {
      return compose(selectedOutline, [], true);
    }
    selectedOutline.push(entry);
  }

  const selectedNotable: NotableEntry[] = [];
  for (const entry of notableNodes) {
    const trial = compose(selectedOutline, [...selectedNotable, entry], true);
    if (serializedBytes(trial) > maxBytes) {
      return compose(selectedOutline, selectedNotable, true);
    }
    selectedNotable.push(entry);
  }

  return compose(selectedOutline, selectedNotable, false);
}

function summaryBase(
  ir: DesignIR,
  root: DesignNode,
  nodes: DesignNode[],
): Omit<
  DesignSummary,
  "outline" | "notableNodes" | "truncated" | "queryCursor"
> {
  return {
    schema: "design-summary/v1",
    artifactId: ir.sourceArtifactId,
    root: {
      id: root.id,
      name: root.name,
      type: root.type,
      size: {
        width: root.geometry.width,
        height: root.geometry.height,
      },
    },
    statistics: {
      nodeCount: nodes.length,
      visibleNodeCount: nodes.filter((node) => node.visible).length,
      textNodeCount: nodes.filter((node) => node.text !== undefined).length,
      componentInstanceCount: nodes.filter(
        (node) => node.component !== undefined,
      ).length,
    },
  };
}

function visibleOutline(
  ir: DesignIR,
  rootNodeId: string,
  maxDepth: number,
): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const visited = new Set<string>();
  const stack: Array<{ id: string; depth: number }> = [
    { id: rootNodeId, depth: 0 },
  ];

  while (stack.length > 0) {
    const currentRef = stack.pop()!;
    if (visited.has(currentRef.id) || currentRef.depth > maxDepth) {
      continue;
    }
    visited.add(currentRef.id);
    const current = ir.nodes[currentRef.id];
    if (!current || !current.visible) {
      continue;
    }

    entries.push({
      id: current.id,
      depth: currentRef.depth,
      type: current.type,
      name: current.name,
      childCount: current.children.length,
    });
    for (let index = current.children.length - 1; index >= 0; index -= 1) {
      const childId = current.children[index];
      if (childId) {
        stack.push({ id: childId, depth: currentRef.depth + 1 });
      }
    }
  }

  return entries;
}

function documentOrder(ir: DesignIR): DesignNode[] {
  const ordered: DesignNode[] = [];
  const visited = new Set<string>();
  const stack = [ir.rootNodeId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);
    const current = ir.nodes[id];
    if (!current) {
      continue;
    }
    ordered.push(current);
    for (let index = current.children.length - 1; index >= 0; index -= 1) {
      const childId = current.children[index];
      if (childId) {
        stack.push(childId);
      }
    }
  }

  for (const [id, node] of Object.entries(ir.nodes)) {
    if (!visited.has(id)) {
      ordered.push(node);
    }
  }
  return ordered;
}

function notableEntries(nodes: DesignNode[]): NotableEntry[] {
  return nodes.flatMap((node): NotableEntry[] => {
    if (node.component) {
      return [
        {
          id: node.id,
          reason: "component-instance",
          componentName: node.component.name ?? node.component.key,
        },
      ];
    }
    if (node.text && node.text.value.length > 0) {
      return [{ id: node.id, reason: "text", text: node.text.value }];
    }
    return [];
  });
}

function serializedBytes(summary: DesignSummary): number {
  return Buffer.byteLength(stableStringify(summary));
}

function limitTooSmall(maxBytes: number): DesignSummaryError {
  return new DesignSummaryError(
    "DESIGN_SUMMARY_LIMIT_TOO_SMALL",
    `Design summary byte limit is too small: ${maxBytes}`,
  );
}
