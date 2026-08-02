import type { ProjectScannerErrorCode } from "@uig/project-scanner";

export type ProjectContextErrorCode =
  | ProjectScannerErrorCode
  | "DUPLICATE_COMPONENT_ID"
  | "MAPPING_TARGET_NOT_FOUND"
  | "SEMANTIC_ROLE_UNKNOWN"
  | "COMPONENT_CAPABILITY_UNKNOWN"
  | "FORM_ADAPTER_UNKNOWN"
  | "PROJECT_COMPONENT_CATALOG_MISSING"
  | "PROJECT_COMPONENT_CATALOG_STALE"
  | "PROJECT_COMPONENT_NOT_FOUND"
  | "CATALOG_ATOMIC_WRITE_FAILED"
  | "PROJECT_CONTEXT_FILESYSTEM_FAILED";

export class ProjectContextError extends Error {
  readonly name = "ProjectContextError";
  constructor(
    readonly code: ProjectContextErrorCode,
    message: string,
  ) {
    super(message);
  }
}
