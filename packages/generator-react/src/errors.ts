export type ReactGenerationErrorCode =
  | "GENERATION_INPUT_INVALID"
  | "GENERATION_INPUT_BLOCKED"
  | "GENERATION_INPUT_INCOMPLETE"
  | "GENERATION_RECIPE_MISSING"
  | "GENERATION_RECIPE_INVALID"
  | "GENERATION_COMPOSITION_AMBIGUOUS"
  | "GENERATION_PROP_CONFLICT"
  | "GENERATION_IMPORT_CONFLICT"
  | "GENERATION_LAYOUT_UNSUPPORTED"
  | "GENERATION_STYLE_OVERRIDE_FORBIDDEN"
  | "GENERATION_FALLBACK_FORBIDDEN"
  | "GENERATION_SOURCE_INVALID"
  | "GENERATION_OUTPUT_CONFLICT";

export class ReactGenerationError extends Error {
  readonly name = "ReactGenerationError";

  constructor(
    readonly code: ReactGenerationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
