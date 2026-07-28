import type { NormalizationOriginKind } from "@uig/contracts";

import {
  DesignNormalizationError,
  isRecord,
  type PixsoRecord,
} from "./pixso-types.js";

export interface RawMaterializationOrigin {
  kind: NormalizationOriginKind;
  sourceNodeId: string;
  componentKey?: string;
  componentDefinitionNodeId?: string;
  sourcePropertyPath?: string;
}

export interface PixsoMaterializationResult {
  root: PixsoRecord;
  origins: WeakMap<object, ReadonlyMap<string, RawMaterializationOrigin>>;
}

export function materializePixsoRoot(_input: {
  root: PixsoRecord;
  componentDefinitions: unknown[];
}): PixsoMaterializationResult {
  const definitions = buildDefinitionsByKey(_input.componentDefinitions);
  assertNoInheritanceCycle(_input.root, definitions, []);
  const origins = new WeakMap<object, Map<string, RawMaterializationOrigin>>();
  return {
    root: materializeNode(_input.root, definitions, origins),
    origins,
  };
}

interface DefinitionDefault {
  record: PixsoRecord;
  path: string;
  sourceNodeId: string;
}

function buildDefinitionsByKey(
  values: unknown[],
): ReadonlyMap<string, readonly PixsoRecord[]> {
  const definitions = new Map<string, PixsoRecord[]>();
  const visit = (value: unknown): void => {
    if (!isRecord(value)) {
      return;
    }
    if (
      typeof value.componentKey === "string" &&
      value.componentKey.length > 0 &&
      value.type === "SYMBOL"
    ) {
      const existing = definitions.get(value.componentKey) ?? [];
      existing.push(value);
      definitions.set(value.componentKey, existing);
    }
    if (Array.isArray(value.childNode)) {
      value.childNode.forEach(visit);
    }
  };
  for (const value of values) {
    visit(value);
  }
  return definitions;
}

function assertNoInheritanceCycle(
  instance: PixsoRecord,
  definitions: ReadonlyMap<string, readonly PixsoRecord[]>,
  activeKeys: readonly string[],
): void {
  if (
    typeof instance.componentKey !== "string" ||
    instance.componentKey.length === 0
  ) {
    return;
  }
  const identity = `${instance.componentKey}\u0000${
    typeof instance.componentNormName === "string"
      ? instance.componentNormName
      : ""
  }`;
  if (activeKeys.includes(identity)) {
    throw new DesignNormalizationError(
      "PIXSO_COMPONENT_INHERITANCE_CYCLE",
      `Pixso component inheritance cycle: ${[...activeKeys, identity].join(
        " -> ",
      )}`,
    );
  }
  const definition = resolveDefinition(instance, definitions);
  if (!definition) {
    return;
  }
  for (const nestedInstance of collectNestedComponentInstances(definition)) {
    assertNoInheritanceCycle(nestedInstance, definitions, [
      ...activeKeys,
      identity,
    ]);
  }
}

function collectNestedComponentInstances(root: PixsoRecord): PixsoRecord[] {
  const instances: PixsoRecord[] = [];
  const visit = (value: unknown, isRoot: boolean): void => {
    if (!isRecord(value)) {
      return;
    }
    if (
      !isRoot &&
      typeof value.componentKey === "string" &&
      value.componentKey.length > 0
    ) {
      instances.push(value);
    }
    if (Array.isArray(value.childNode)) {
      value.childNode.forEach((child) => visit(child, false));
    }
  };
  visit(root, true);
  return instances.sort((left, right) =>
    rawNodeId(left, "").localeCompare(rawNodeId(right, "")),
  );
}

function resolveDefinition(
  instance: PixsoRecord,
  definitions: ReadonlyMap<string, readonly PixsoRecord[]>,
): PixsoRecord | undefined {
  if (
    typeof instance.componentKey !== "string" ||
    instance.componentKey.length === 0
  ) {
    return undefined;
  }
  const candidates = definitions.get(instance.componentKey) ?? [];
  const variant =
    typeof instance.componentNormName === "string"
      ? instance.componentNormName
      : undefined;
  const compatible = variant
    ? candidates.filter((candidate) => candidate.componentNormName === variant)
    : candidates;
  if (compatible.length === 1) {
    return compatible[0];
  }
  if (compatible.length === 0 && candidates.length === 1) {
    return candidates[0];
  }
  if (compatible.length === 0 && candidates.length === 0) {
    return undefined;
  }
  throw new DesignNormalizationError(
    "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS",
    `Pixso component key ${instance.componentKey} has multiple compatible definitions`,
  );
}

function materializeNode(
  source: PixsoRecord,
  definitions: ReadonlyMap<string, readonly PixsoRecord[]>,
  origins: WeakMap<object, Map<string, RawMaterializationOrigin>>,
): PixsoRecord {
  const output = cloneOwnFields(source, origins);
  const componentKey =
    typeof source.componentKey === "string" && source.componentKey.length > 0
      ? source.componentKey
      : undefined;
  const definition = componentKey
    ? resolveDefinition(source, definitions)
    : undefined;
  const defaults = definition
    ? collectDefinitionDefaults(definition)
    : new Map<string, DefinitionDefault>();
  let propertyForest: PixsoRecord[] = [];

  if (Array.isArray(source.props)) {
    const effectiveProperties = source.props.flatMap((property) => {
      if (!isRecord(property)) {
        return [];
      }
      const path = canonicalPropertyPath(property.pathString).path;
      return [
        mergeEffectiveRecord(property, defaults.get(path), {
          origins,
          ...(componentKey ? { componentKey } : {}),
          ...(definition ? { definition } : {}),
        }),
      ];
    });
    propertyForest = buildPropertyForest(effectiveProperties);
  } else if (source.props !== undefined) {
    output.props = structuredClone(source.props);
  }

  const materializedChildren: PixsoRecord[] = [];
  if (Array.isArray(source.childNode)) {
    for (const child of source.childNode) {
      if (isRecord(child)) {
        materializedChildren.push(materializeNode(child, definitions, origins));
      }
    }
  }
  if (
    Array.isArray(source.childNode) ||
    Array.isArray(source.props) ||
    propertyForest.length > 0
  ) {
    output.childNode = [...materializedChildren, ...propertyForest];
  }
  return output;
}

function cloneOwnFields(
  source: PixsoRecord,
  origins: WeakMap<object, Map<string, RawMaterializationOrigin>>,
): PixsoRecord {
  const output: PixsoRecord = {};
  const recordOrigins = new Map<string, RawMaterializationOrigin>();
  const sourceNodeId = rawNodeId(source, "instance");

  for (const [field, value] of Object.entries(source)) {
    if (field === "childNode" || field === "props") {
      continue;
    }
    output[field] = structuredClone(value);
    recordOrigins.set(field, {
      kind: "instance-value",
      sourceNodeId,
      ...(typeof source.pathString === "string"
        ? { sourcePropertyPath: source.pathString }
        : {}),
    });
  }
  origins.set(output, recordOrigins);
  return output;
}

function collectDefinitionDefaults(
  definition: PixsoRecord,
): ReadonlyMap<string, DefinitionDefault> {
  const defaults = new Map<string, DefinitionDefault>();

  const visit = (node: PixsoRecord, prefix: string): void => {
    if (prefix.length > 0) {
      defaults.set(prefix, {
        record: node,
        path: prefix,
        sourceNodeId: rawNodeId(node, prefix),
      });
    }

    if (Array.isArray(node.props)) {
      for (const property of node.props) {
        if (!isRecord(property) || typeof property.pathString !== "string") {
          continue;
        }
        const ownerPath = node === definition ? "" : rawNodeId(node, prefix);
        const path = qualifyPath(ownerPath, property.pathString);
        defaults.set(path, {
          record: property,
          path,
          sourceNodeId: rawNodeId(property, path),
        });
      }
    }

    if (Array.isArray(node.childNode)) {
      for (const child of node.childNode) {
        if (!isRecord(child)) {
          continue;
        }
        const localPath = rawNodeId(child, "");
        if (localPath.length > 0) {
          visit(child, qualifyPath(prefix, localPath));
        }
      }
    }
  };

  if (Array.isArray(definition.props)) {
    visit(definition, "");
  }
  if (Array.isArray(definition.childNode)) {
    for (const child of definition.childNode) {
      if (isRecord(child)) {
        const path = rawNodeId(child, "");
        if (path.length > 0) {
          visit(child, path);
        }
      }
    }
  }
  return defaults;
}

function mergeEffectiveRecord(
  instance: PixsoRecord,
  fallback: DefinitionDefault | undefined,
  context: {
    componentKey?: string;
    definition?: PixsoRecord;
    origins: WeakMap<object, Map<string, RawMaterializationOrigin>>;
  },
): PixsoRecord {
  const output: PixsoRecord = {};
  const recordOrigins = new Map<string, RawMaterializationOrigin>();
  const fields = new Set([
    ...Object.keys(fallback?.record ?? {}),
    ...Object.keys(instance),
  ]);
  const instanceNodeId = rawNodeId(
    instance,
    typeof instance.pathString === "string" ? instance.pathString : "instance",
  );
  const definitionNodeId = context.definition
    ? rawNodeId(context.definition, "definition")
    : undefined;

  for (const field of [...fields].sort()) {
    const hasInstance = Object.prototype.hasOwnProperty.call(instance, field);
    const hasFallback = Object.prototype.hasOwnProperty.call(
      fallback?.record ?? {},
      field,
    );
    if (
      !hasInstance &&
      (field === "childNode" || field === "props" || field === "guid")
    ) {
      continue;
    }
    if (!hasInstance && !hasFallback) {
      continue;
    }

    output[field] = hasInstance
      ? hasFallback
        ? mergeValue(fallback!.record[field], instance[field])
        : structuredClone(instance[field])
      : structuredClone(fallback!.record[field]);
    const fromInstance = hasInstance;
    recordOrigins.set(field, {
      kind: fromInstance
        ? hasFallback
          ? "instance-override"
          : "instance-value"
        : "component-default",
      sourceNodeId: fromInstance ? instanceNodeId : fallback!.sourceNodeId,
      ...(context.componentKey ? { componentKey: context.componentKey } : {}),
      ...(definitionNodeId
        ? { componentDefinitionNodeId: definitionNodeId }
        : {}),
      ...(typeof instance.pathString === "string"
        ? { sourcePropertyPath: instance.pathString }
        : fallback
          ? { sourcePropertyPath: fallback.path }
          : {}),
    });
  }

  context.origins.set(output, recordOrigins);
  return output;
}

function mergeValue(fallback: unknown, override: unknown): unknown {
  if (isRecord(fallback) && isRecord(override)) {
    const output: PixsoRecord = {};
    const keys = new Set([...Object.keys(fallback), ...Object.keys(override)]);
    for (const key of [...keys].sort()) {
      output[key] = Object.prototype.hasOwnProperty.call(override, key)
        ? Object.prototype.hasOwnProperty.call(fallback, key)
          ? mergeValue(fallback[key], override[key])
          : structuredClone(override[key])
        : structuredClone(fallback[key]);
    }
    return output;
  }
  return structuredClone(override);
}

function canonicalPropertyPath(value: unknown): {
  path: string;
  segments: string[];
} {
  if (typeof value !== "string") {
    throw new DesignNormalizationError(
      "PIXSO_PROPERTY_PATH_INVALID",
      "Pixso property path must be a string",
    );
  }
  const segments = value.split("/");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new DesignNormalizationError(
      "PIXSO_PROPERTY_PATH_INVALID",
      `Pixso property path is invalid: ${JSON.stringify(value)}`,
    );
  }
  return { path: segments.join("/"), segments };
}

function buildPropertyForest(properties: PixsoRecord[]): PixsoRecord[] {
  const byPath = new Map<string, PixsoRecord>();
  for (const property of properties) {
    const { path } = canonicalPropertyPath(property.pathString);
    if (byPath.has(path)) {
      throw new DesignNormalizationError(
        "PIXSO_PROPERTY_IDENTITY_CONFLICT",
        `Pixso property path ${path} has multiple records`,
      );
    }
    byPath.set(path, property);
  }

  const roots: PixsoRecord[] = [];
  for (const [path, property] of [...byPath.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const segments = path.split("/");
    let parent: PixsoRecord | undefined;
    for (let length = segments.length - 1; length > 0; length -= 1) {
      parent = byPath.get(segments.slice(0, length).join("/"));
      if (parent) {
        break;
      }
    }
    if (!parent) {
      roots.push(property);
      continue;
    }
    const existingChildren = Array.isArray(parent.childNode)
      ? parent.childNode.filter(isRecord)
      : [];
    parent.childNode = [...existingChildren, property].sort(
      compareVisualThenPath,
    );
  }
  return roots.sort(compareVisualThenPath);
}

function compareVisualThenPath(left: PixsoRecord, right: PixsoRecord): number {
  const vertical = sortableNumber(left.top) - sortableNumber(right.top);
  if (vertical !== 0) {
    return vertical;
  }
  const horizontal = sortableNumber(left.left) - sortableNumber(right.left);
  if (horizontal !== 0) {
    return horizontal;
  }
  const leftPath =
    typeof left.pathString === "string" ? left.pathString : rawNodeId(left, "");
  const rightPath =
    typeof right.pathString === "string"
      ? right.pathString
      : rawNodeId(right, "");
  return leftPath.localeCompare(rightPath);
}

function sortableNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.POSITIVE_INFINITY;
}

function qualifyPath(prefix: string, path: string): string {
  if (prefix.length === 0 || path === prefix || path.startsWith(`${prefix}/`)) {
    return path;
  }
  return `${prefix}/${path}`;
}

function rawNodeId(node: PixsoRecord, fallback: string): string {
  for (const field of ["guid", "componentId", "pathString"] as const) {
    const value = node[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return fallback;
}
