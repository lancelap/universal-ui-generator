export function formatDiagnostic(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : "Command failed";
    return `${error.code}: ${message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
