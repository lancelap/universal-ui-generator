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
): ReadonlyMap<string, PixsoRecord> {
  const definitions = new Map<string, PixsoRecord>();
  const seen = new WeakSet<object>();

  const visit = (value: unknown): void => {
    if (!isRecord(value) || seen.has(value)) {
      return;
    }
    seen.add(value);

    if (
      typeof value.componentKey === "string" &&
      value.componentKey.length > 0
    ) {
      const existing = definitions.get(value.componentKey);
      if (existing && existing !== value) {
        throw new DesignNormalizationError(
          "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS",
          `Pixso component key ${value.componentKey} has multiple definitions`,
        );
      }
      definitions.set(value.componentKey, value);
    }

    if (Array.isArray(value.childNode)) {
      value.childNode.forEach(visit);
    }
  };

  values.forEach(visit);
  return definitions;
}

function materializeNode(
  source: PixsoRecord,
  definitions: ReadonlyMap<string, PixsoRecord>,
  origins: WeakMap<object, Map<string, RawMaterializationOrigin>>,
): PixsoRecord {
  const output = cloneOwnFields(source, origins);
  const componentKey =
    typeof source.componentKey === "string" && source.componentKey.length > 0
      ? source.componentKey
      : undefined;
  const definition = componentKey ? definitions.get(componentKey) : undefined;
  const defaults = definition
    ? collectDefinitionDefaults(definition)
    : new Map<string, DefinitionDefault>();

  if (Array.isArray(source.props)) {
    output.props = source.props.map((property) => {
      if (!isRecord(property)) {
        return structuredClone(property);
      }
      const path =
        typeof property.pathString === "string" ? property.pathString : "";
      return mergeEffectiveRecord(property, defaults.get(path), {
        origins,
        ...(componentKey ? { componentKey } : {}),
        ...(definition ? { definition } : {}),
      });
    });
  } else if (source.props !== undefined) {
    output.props = structuredClone(source.props);
  }

  if (Array.isArray(source.childNode)) {
    output.childNode = source.childNode.map((child) =>
      isRecord(child)
        ? materializeNode(child, definitions, origins)
        : structuredClone(child),
    );
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
        const path = qualifyPath(prefix, property.pathString);
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
