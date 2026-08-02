import type { ProjectScanDiagnostic, UiContextConfigV1 } from "@uig/contracts";

export interface ProjectDiscovery {
  schema: "project-discovery/v1";
  discoveryId: string;
  packageManager: "pnpm" | "npm" | "yarn";
  packageName: string;
  lockfilePath: string;
  tsconfigPath: string;
  proposedConfig: UiContextConfigV1;
  evidencePaths: string[];
  diagnostics: ProjectScanDiagnostic[];
}

export interface ResolvedPublicRoot {
  kind: "component" | "icon";
  path: string;
  entry: string;
  importSource: string;
  absoluteEntryPath: string;
}

export type ProjectScannerErrorCode =
  | "UI_CONTEXT_CONFIG_INVALID"
  | "CONFIG_PATH_OUTSIDE_WORKSPACE"
  | "CONFIG_SYMLINK_ESCAPES_WORKSPACE"
  | "MULTIPLE_LOCKFILES_FOUND"
  | "PACKAGE_MANAGER_UNSUPPORTED"
  | "PUBLIC_FACADE_NOT_FOUND"
  | "PUBLIC_IMPORT_SOURCE_UNRESOLVED"
  | "PUBLIC_IMPORT_SOURCE_MISMATCH"
  | "PUBLIC_TYPES_ENTRY_NOT_FOUND"
  | "INSTALLED_PACKAGE_NOT_FOUND";

export class ProjectScannerError extends Error {
  readonly name = "ProjectScannerError";

  constructor(
    readonly code: ProjectScannerErrorCode,
    message: string,
  ) {
    super(message);
  }
}
