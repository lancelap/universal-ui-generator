import {
  DesignIRSchema,
  type DesignIR,
  DesignIRV2Schema,
  type DesignIRV2,
  type DesignNode,
  type DesignNodeV2,
  type Diagnostic,
  assertDesignIRV2Integrity,
  validateWithSchema,
} from "@uig/contracts";

import {
  normalizePixsoNode,
  normalizePixsoNodeV2,
  pixsoNodeId,
} from "./normalize-node.js";
import {
  DesignNormalizationError,
  isRecord,
  readPixsoEnvelope,
  type PixsoRecord,
  unsupported,
} from "./pixso-types.js";

export function normalizePixsoDesign(input: {
  artifactId: string;
  rootNodeId?: string;
  rawDsl: unknown;
}): DesignIR {
  return normalizePixsoDesignVersion(input, "v1") as DesignIR;
}

export function normalizePixsoDesignV2(input: {
  artifactId: string;
  rootNodeId?: string;
  rawDsl: unknown;
}): DesignIRV2 {
  return normalizePixsoDesignVersion(input, "v2") as DesignIRV2;
}

function normalizePixsoDesignVersion(
  input: {
    artifactId: string;
    rootNodeId?: string;
    rawDsl: unknown;
  },
  version: "v1" | "v2",
): DesignIR | DesignIRV2 {
  const envelope = readPixsoEnvelope(input.rawDsl);
  const root = selectRoot(envelope.dsl.pixTreeDslNodes, input.rootNodeId);
  if (!isRecord(root)) {
    throw unsupported("Pixso root node must be an object");
  }

  const nodeIndex = buildNodeIndex([root]);
  addNodesToIndex(nodeIndex, envelope.dsl.pixTreeDslNodes, false);
  const diagnostics: Diagnostic[] = [];
  const nodes: Record<string, DesignNode | DesignNodeV2> = {};
  const reservedIds = new Set<string>();
  const activeObjects = new WeakSet<object>();

  const traverse = (rawNode: PixsoRecord, contextPath: string): string => {
    if (activeObjects.has(rawNode)) {
      throw unsupported("Pixso child tree contains a cycle");
    }
    activeObjects.add(rawNode);

    const baseId = pixsoNodeId(rawNode);
    const id = reserveNodeId(rawNode, baseId, contextPath, reservedIds);

    const rawChildren = rawNode.childNode;
    if (rawChildren !== undefined && !Array.isArray(rawChildren)) {
      throw unsupported(`Pixso childNode must be an array on ${id}`);
    }
    const propChildren = Array.isArray(rawNode.props)
      ? rawNode.props.filter(isVisualPropertyOverride)
      : [];
    const resolvedChildren = [...(rawChildren ?? []), ...propChildren].map(
      (child) => resolveChild(child, nodeIndex, id),
    );
    const childIds = resolvedChildren.map((child, index) =>
      traverse(child, `${id}/${index}`),
    );
    const context = {
      artifactId: input.artifactId,
      diagnostics,
      nodeId: id,
    };
    nodes[id] =
      version === "v2"
        ? normalizePixsoNodeV2(rawNode, childIds, context)
        : normalizePixsoNode(rawNode, childIds, context);
    activeObjects.delete(rawNode);
    return id;
  };

  const rootNodeId = traverse(root, pixsoNodeId(root));
  const common = {
    sourceArtifactId: input.artifactId,
    dslVersion: envelope.dsl.dslVersion,
    rootNodeId,
    nodes,
    diagnostics,
  };

  try {
    if (version === "v2") {
      const result = validateWithSchema(DesignIRV2Schema, {
        schema: "design-ir/v2",
        ...common,
      });
      assertDesignIRV2Integrity(result);
      return result;
    }
    return validateWithSchema(DesignIRSchema, {
      schema: "design-ir/v1",
      ...common,
    });
  } catch (error) {
    throw unsupported(
      "Normalized DesignIR violates its public contract",
      error,
    );
  }
}

function isVisualPropertyOverride(value: unknown): boolean {
  return (
    isRecord(value) &&
    [value.left, value.top, value.width, value.height].every(
      (coordinate) =>
        typeof coordinate === "number" && Number.isFinite(coordinate),
    )
  );
}

function reserveNodeId(
  rawNode: PixsoRecord,
  baseId: string,
  contextPath: string,
  reservedIds: Set<string>,
): string {
  if (!reservedIds.has(baseId)) {
    reservedIds.add(baseId);
    return baseId;
  }
  if (typeof rawNode.guid === "string" && rawNode.guid.length > 0) {
    throw unsupported(`Duplicate normalized Pixso node ID: ${baseId}`);
  }

  let candidate = `${baseId}@${contextPath}`;
  let suffix = 2;
  while (reservedIds.has(candidate)) {
    candidate = `${baseId}@${contextPath}#${suffix}`;
    suffix += 1;
  }
  reservedIds.add(candidate);
  return candidate;
}

function selectRoot(values: unknown[], requestedId?: string): unknown {
  if (requestedId) {
    const root = values.find(
      (value) => isRecord(value) && pixsoNodeId(value) === requestedId,
    );
    if (!root) {
      throw unsupported(
        `Pixso design root ${requestedId} is not present in pixTreeDslNodes`,
      );
    }
    return root;
  }
  if (values.length !== 1) {
    throw unsupported(
      "Pixso DSL contains multiple design roots; rootNodeId is required",
    );
  }
  return values[0];
}

function buildNodeIndex(values: unknown[]): Map<string, PixsoRecord> {
  const index = new Map<string, PixsoRecord>();
  addNodesToIndex(index, values, true);
  return index;
}

function addNodesToIndex(
  index: Map<string, PixsoRecord>,
  values: unknown[],
  rejectDuplicates: boolean,
): void {
  const seenObjects = new WeakSet<object>();

  const collect = (value: unknown): void => {
    if (!isRecord(value) || seenObjects.has(value)) {
      return;
    }
    seenObjects.add(value);

    const id = pixsoNodeId(value);
    const existing = index.get(id);
    if (existing && existing !== value) {
      const hasStableGuid =
        typeof value.guid === "string" && value.guid.length > 0;
      if (rejectDuplicates && hasStableGuid) {
        throw unsupported(`Duplicate Pixso source node ID: ${id}`);
      }
      return;
    }
    index.set(id, value);

    if (Array.isArray(value.childNode)) {
      value.childNode.forEach(collect);
    }
    if (Array.isArray(value.props)) {
      value.props.forEach(collect);
    }
  };

  values.forEach(collect);
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
