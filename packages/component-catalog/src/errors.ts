export type DesignSystemPackErrorCode =
  | "DESIGN_SYSTEM_PACK_INVALID"
  | "COMPONENT_CATALOG_ENTRY_INVALID"
  | "RULE_REFERENCE_MISSING"
  | "COMPOSITION_CYCLE_DETECTED"
  | "COMPONENT_EXPORT_UNVERIFIED"
  | "REACT_RECIPE_COMPONENT_MISSING"
  | "REACT_RECIPE_COMPONENT_UNCOVERED"
  | "REACT_RECIPE_PROP_CONFLICT"
  | "REACT_COMPOSITION_RECIPE_INVALID"
  | "REACT_STRUCTURED_RECIPE_INVALID"
  | "REACT_STYLE_COMPONENT_MISSING";

export class DesignSystemPackError extends Error {
  readonly name = "DesignSystemPackError";

  constructor(
    readonly code: DesignSystemPackErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
