export type DesignSystemPackErrorCode =
  | "DESIGN_SYSTEM_PACK_INVALID"
  | "COMPONENT_CATALOG_ENTRY_INVALID"
  | "RULE_REFERENCE_MISSING"
  | "COMPOSITION_CYCLE_DETECTED"
  | "COMPONENT_EXPORT_UNVERIFIED";

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
