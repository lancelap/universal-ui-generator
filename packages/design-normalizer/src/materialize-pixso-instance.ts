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
  const definitions = buildDefinitionIndexes(_input.componentDefinitions);
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

interface DefinitionDefaults {
  byPath: ReadonlyMap<string, DefinitionDefault>;
  byGuid: ReadonlyMap<string, readonly DefinitionDefault[]>;
}

interface DefinitionIndexes {
  byKey: ReadonlyMap<string, readonly PixsoRecord[]>;
  byNormName: ReadonlyMap<string, readonly PixsoRecord[]>;
}

type DefinitionIdentity =
  | {
      kind: "key";
      componentKey: string;
      componentNormName?: string;
    }
  | {
      kind: "norm";
      componentNormName: string;
    };

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function definitionIdentity(
  instance: PixsoRecord,
): DefinitionIdentity | undefined {
  const componentKey = nonEmptyString(instance.componentKey);
  const componentNormName = nonEmptyString(instance.componentNormName);
  if (componentKey) {
    return {
      kind: "key",
      componentKey,
      ...(componentNormName ? { componentNormName } : {}),
    };
  }
  return componentNormName ? { kind: "norm", componentNormName } : undefined;
}

function buildDefinitionIndexes(values: unknown[]): DefinitionIndexes {
  const byKey = new Map<string, PixsoRecord[]>();
  const byNormName = new Map<string, PixsoRecord[]>();
  const add = (
    index: Map<string, PixsoRecord[]>,
    identity: string,
    definition: PixsoRecord,
  ): void => {
    const candidates = index.get(identity) ?? [];
    candidates.push(definition);
    index.set(identity, candidates);
  };
  const visit = (value: unknown): void => {
    if (!isRecord(value)) {
      return;
    }
    if (value.type === "SYMBOL") {
      const componentKey = nonEmptyString(value.componentKey);
      const componentNormName = nonEmptyString(value.componentNormName);
      if (componentKey) {
        add(byKey, componentKey, value);
      } else if (componentNormName) {
        add(byNormName, componentNormName, value);
      }
    }
    if (Array.isArray(value.childNode)) {
      value.childNode.forEach(visit);
    }
  };
  for (const value of values) {
    visit(value);
  }
  return { byKey, byNormName };
}

function assertNoInheritanceCycle(
  instance: PixsoRecord,
  definitions: DefinitionIndexes,
  activeIdentities: readonly string[],
): void {
  const definitionIdentityValue = definitionIdentity(instance);
  if (!definitionIdentityValue) {
    return;
  }
  const identity = serializeDefinitionIdentity(definitionIdentityValue);
  if (activeIdentities.includes(identity)) {
    throw new DesignNormalizationError(
      "PIXSO_COMPONENT_INHERITANCE_CYCLE",
      `Pixso component inheritance cycle: ${[
        ...activeIdentities,
        identity,
      ].join(" -> ")}`,
    );
  }
  const definition = resolveDefinition(instance, definitions);
  if (!definition) {
    return;
  }
  for (const nestedInstance of collectNestedComponentInstances(definition)) {
    assertNoInheritanceCycle(nestedInstance, definitions, [
      ...activeIdentities,
      identity,
    ]);
  }
}

function serializeDefinitionIdentity(identity: DefinitionIdentity): string {
  return identity.kind === "key"
    ? `key:${identity.componentKey}\u0000${identity.componentNormName ?? ""}`
    : `norm:${identity.componentNormName}`;
}

function collectNestedComponentInstances(root: PixsoRecord): PixsoRecord[] {
  const instances: PixsoRecord[] = [];
  const visit = (value: unknown, isRoot: boolean): void => {
    if (!isRecord(value)) {
      return;
    }
    if (!isRoot && definitionIdentity(value)) {
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
  definitions: DefinitionIndexes,
): PixsoRecord | undefined {
  const identity = definitionIdentity(instance);
  if (!identity) {
    return undefined;
  }

  if (identity.kind === "key") {
    const candidates = definitions.byKey.get(identity.componentKey) ?? [];
    const compatible = identity.componentNormName
      ? candidates.filter(
          (candidate) =>
            candidate.componentNormName === identity.componentNormName,
        )
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
      `Pixso component key ${identity.componentKey} has multiple compatible definitions`,
    );
  }

  const candidates =
    definitions.byNormName.get(identity.componentNormName) ?? [];
  if (candidates.length === 0) {
    return undefined;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  const candidateIds = candidates
    .map((candidate) => rawNodeId(candidate, "definition"))
    .sort((left, right) => left.localeCompare(right));
  throw new DesignNormalizationError(
    "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS",
    `Pixso componentNormName ${identity.componentNormName} has ${
      candidates.length
    } keyless SYMBOL definitions: ${candidateIds.join(", ")}`,
  );
}

function materializeNode(
  source: PixsoRecord,
  definitions: DefinitionIndexes,
  origins: WeakMap<object, Map<string, RawMaterializationOrigin>>,
): PixsoRecord {
  const output = cloneOwnFields(source, origins);
  const componentKey = nonEmptyString(source.componentKey);
  const definition = resolveDefinition(source, definitions);
  const defaults = definition
    ? collectDefinitionDefaults(definition)
    : { byPath: new Map(), byGuid: new Map() };
  let propertyForest: PixsoRecord[] = [];

  if (Array.isArray(source.props)) {
    const effectiveProperties = source.props.flatMap((property) => {
      if (!isRecord(property)) {
        return [];
      }
      const canonicalPath = canonicalPropertyPath(property.pathString);
      const fallback =
        defaults.byPath.get(canonicalPath.path) ??
        resolveSingleSegmentGuidDefault(canonicalPath, defaults);
      return [
        mergeEffectiveRecord(property, fallback, {
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
): DefinitionDefaults {
  const byPath = new Map<string, DefinitionDefault>();
  const byGuid = new Map<string, DefinitionDefault[]>();

  const addGuidDefault = (
    node: PixsoRecord,
    fallback: DefinitionDefault,
  ): void => {
    if (typeof node.guid !== "string" || node.guid.length === 0) {
      return;
    }
    byGuid.set(node.guid, [...(byGuid.get(node.guid) ?? []), fallback]);
  };

  const visit = (node: PixsoRecord, prefix: string): void => {
    if (prefix.length > 0) {
      const fallback = {
        record: node,
        path: prefix,
        sourceNodeId: rawNodeId(node, prefix),
      };
      byPath.set(prefix, fallback);
      addGuidDefault(node, fallback);
    }

    if (Array.isArray(node.props)) {
      for (const property of node.props) {
        if (!isRecord(property) || typeof property.pathString !== "string") {
          continue;
        }
        const ownerPath = node === definition ? "" : rawNodeId(node, prefix);
        const path = qualifyPath(ownerPath, property.pathString);
        const fallback = {
          record: property,
          path,
          sourceNodeId: rawNodeId(property, path),
        };
        byPath.set(path, fallback);
        addGuidDefault(property, fallback);
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
  for (const values of byGuid.values()) {
    values.sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.sourceNodeId.localeCompare(right.sourceNodeId),
    );
  }
  return { byPath, byGuid };
}

function resolveSingleSegmentGuidDefault(
  propertyPath: { path: string; segments: string[] },
  defaults: DefinitionDefaults,
): DefinitionDefault | undefined {
  if (propertyPath.segments.length !== 1) {
    return undefined;
  }
  const candidates = defaults.byGuid.get(propertyPath.path) ?? [];
  if (candidates.length <= 1) {
    return candidates[0];
  }
  throw new DesignNormalizationError(
    "PIXSO_PROPERTY_DEFINITION_AMBIGUOUS",
    `Pixso property path ${propertyPath.path} matches ${candidates.length} definition nodes: ${candidates
      .map((candidate) => candidate.path)
      .join(", ")}`,
  );
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
