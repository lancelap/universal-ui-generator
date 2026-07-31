export type DesignNormalizationErrorCode =
  | "DESIGN_DSL_UNSUPPORTED"
  | "DESIGN_NODE_REFERENCE_MISSING"
  | "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS"
  | "PIXSO_COMPONENT_INHERITANCE_CYCLE"
  | "PIXSO_PROPERTY_DEFINITION_AMBIGUOUS"
  | "PIXSO_PROPERTY_IDENTITY_CONFLICT"
  | "PIXSO_PROPERTY_PATH_INVALID";

export class DesignNormalizationError extends Error {
  readonly name = "DesignNormalizationError";

  constructor(
    readonly code: DesignNormalizationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export interface PixsoDslDocument {
  dslVersion: string;
  converterVersion: string;
  pixTreeDslNodes: unknown[];
  pixComponentTreeDslNodes: unknown[];
  localStyleMap: Record<string, unknown>;
  variableMap: Record<string, unknown>;
  variableSetMap: Record<string, unknown>;
}

export interface PixsoDslEnvelope {
  dsl: PixsoDslDocument;
}

export type PixsoRecord = Record<string, unknown>;

export function readPixsoEnvelope(value: unknown): PixsoDslEnvelope {
  if (!isRecord(value) || !isRecord(value.dsl)) {
    throw unsupported("Pixso DSL must be an object with a dsl property");
  }

  const dsl = value.dsl;
  if (
    typeof dsl.dslVersion !== "string" ||
    dsl.dslVersion.length === 0 ||
    typeof dsl.converterVersion !== "string" ||
    dsl.converterVersion.length === 0 ||
    !Array.isArray(dsl.pixTreeDslNodes) ||
    !Array.isArray(dsl.pixComponentTreeDslNodes) ||
    !isRecord(dsl.localStyleMap) ||
    !isRecord(dsl.variableMap) ||
    !isRecord(dsl.variableSetMap)
  ) {
    throw unsupported("Pixso DSL envelope has an unsupported shape");
  }

  if (dsl.pixTreeDslNodes.length === 0) {
    throw unsupported("Pixso DSL must contain at least one design root");
  }

  return {
    dsl: {
      dslVersion: dsl.dslVersion,
      converterVersion: dsl.converterVersion,
      pixTreeDslNodes: dsl.pixTreeDslNodes,
      pixComponentTreeDslNodes: dsl.pixComponentTreeDslNodes,
      localStyleMap: dsl.localStyleMap,
      variableMap: dsl.variableMap,
      variableSetMap: dsl.variableSetMap,
    },
  };
}

export function isRecord(value: unknown): value is PixsoRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function finiteNumber(
  value: unknown,
  field: string,
  fallback?: number,
): number {
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw unsupported(`Pixso field ${field} must be a finite number`);
  }
  return value;
}

export function optionalFiniteNumber(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return finiteNumber(value, field);
}

export function unsupported(
  message: string,
  cause?: unknown,
): DesignNormalizationError {
  return new DesignNormalizationError("DESIGN_DSL_UNSUPPORTED", message, {
    cause,
  });
}
