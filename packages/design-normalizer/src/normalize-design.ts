import {
  DesignIRSchema,
  type DesignIR,
  type DesignNode,
  type Diagnostic,
  validateWithSchema,
} from "@uig/contracts";

import { normalizePixsoNode, pixsoNodeId } from "./normalize-node.js";
import {
  DesignNormalizationError,
  isRecord,
  readPixsoEnvelope,
  type PixsoRecord,
  unsupported,
} from "./pixso-types.js";

export function normalizePixsoDesign(input: {
  artifactId: string;
  rawDsl: unknown;
}): DesignIR {
  const envelope = readPixsoEnvelope(input.rawDsl);
  const root = envelope.dsl.pixTreeDslNodes[0];
  if (!isRecord(root)) {
    throw unsupported("Pixso root node must be an object");
  }

  const nodeIndex = buildNodeIndex([
    ...envelope.dsl.pixTreeDslNodes,
    ...envelope.dsl.pixComponentTreeDslNodes,
  ]);
  const diagnostics: Diagnostic[] = [];
  const nodes: Record<string, DesignNode> = {};
  const activeObjects = new WeakSet<object>();

  const traverse = (rawNode: PixsoRecord): string => {
    if (activeObjects.has(rawNode)) {
      throw unsupported("Pixso child tree contains a cycle");
    }
    activeObjects.add(rawNode);

    const id = pixsoNodeId(rawNode);
    if (nodes[id]) {
      throw unsupported(`Duplicate normalized Pixso node ID: ${id}`);
    }

    const rawChildren = rawNode.childNode;
    if (rawChildren !== undefined && !Array.isArray(rawChildren)) {
      throw unsupported(`Pixso childNode must be an array on ${id}`);
    }
    const resolvedChildren = (rawChildren ?? []).map((child) =>
      resolveChild(child, nodeIndex, id),
    );
    const childIds = resolvedChildren.map(pixsoNodeId);
    nodes[id] = normalizePixsoNode(rawNode, childIds, {
      artifactId: input.artifactId,
      diagnostics,
    });
    resolvedChildren.forEach(traverse);
    activeObjects.delete(rawNode);
    return id;
  };

  const rootNodeId = traverse(root);
  const result: DesignIR = {
    schema: "design-ir/v1",
    sourceArtifactId: input.artifactId,
    dslVersion: envelope.dsl.dslVersion,
    rootNodeId,
    nodes,
    diagnostics,
  };

  try {
    return validateWithSchema(DesignIRSchema, result);
  } catch (error) {
    throw unsupported(
      "Normalized DesignIR violates its public contract",
      error,
    );
  }
}

function buildNodeIndex(values: unknown[]): Map<string, PixsoRecord> {
  const index = new Map<string, PixsoRecord>();
  const seenObjects = new WeakSet<object>();

  const collect = (value: unknown): void => {
    if (!isRecord(value) || seenObjects.has(value)) {
      return;
    }
    seenObjects.add(value);

    const id = pixsoNodeId(value);
    const existing = index.get(id);
    if (existing && existing !== value) {
      throw unsupported(`Duplicate Pixso source node ID: ${id}`);
    }
    index.set(id, value);

    if (Array.isArray(value.childNode)) {
      value.childNode.forEach(collect);
    }
  };

  values.forEach(collect);
  return index;
}

function resolveChild(
  value: unknown,
  index: Map<string, PixsoRecord>,
  parentId: string,
): PixsoRecord {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value === "string") {
    const resolved = index.get(value);
    if (resolved) {
      return resolved;
    }
  }

  throw new DesignNormalizationError(
    "DESIGN_NODE_REFERENCE_MISSING",
    `Pixso node ${parentId} references a missing child`,
  );
}
