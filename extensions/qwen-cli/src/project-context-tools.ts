import {
  ProjectContextError,
  type ProjectContextService,
} from "@uig/project-context";
import { ZodError, type ZodType } from "zod";

import {
  ComponentContractInputSchema,
  ComponentContractResultSchema,
  EmptyInputSchema,
  IconPathsInputSchema,
  IconPathsResultSchema,
  MappingMutationInputSchema,
  MappingMutationResultSchema,
  ProjectComponentSearchInputSchema,
  ProjectComponentSearchResultSchema,
  ProjectScanInputSchema,
  ProjectScanResultSchema,
  ProjectStatusResultSchema,
  compactProjectScanResult,
} from "./project-context-results.js";
import { UigToolError } from "./tools.js";

export function createProjectContextTools(service: ProjectContextService) {
  return {
    scanProjectComponents: wrap(
      ProjectScanInputSchema,
      ProjectScanResultSchema,
      async (input) =>
        compactProjectScanResult(await service.scan(defined(input))),
    ),
    projectComponentSearch: wrap(
      ProjectComponentSearchInputSchema,
      ProjectComponentSearchResultSchema,
      (input) => service.search(defined(input)),
    ),
    getComponentContract: wrap(
      ComponentContractInputSchema,
      ComponentContractResultSchema,
      (input) => service.getComponentContract(input),
    ),
    getIconPaths: wrap(IconPathsInputSchema, IconPathsResultSchema, (input) =>
      service.getIconPaths(input),
    ),
    confirmProjectComponentMappings: wrap(
      MappingMutationInputSchema,
      MappingMutationResultSchema,
      (input) => service.confirmMappings(input),
    ),
    removeProjectComponentMappings: wrap(
      MappingMutationInputSchema,
      MappingMutationResultSchema,
      (input) => service.removeMappings(input),
    ),
    getProjectUiContextStatus: wrap(
      EmptyInputSchema,
      ProjectStatusResultSchema,
      () => service.status(),
    ),
  };
}

function defined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as {
    [K in keyof T as undefined extends T[K] ? K : K]: Exclude<T[K], undefined>;
  };
}

function wrap<I, O>(
  inputSchema: ZodType<I>,
  outputSchema: ZodType<O>,
  action: (input: I) => Promise<unknown>,
) {
  return async (input: unknown): Promise<O> => {
    let parsed: I;
    try {
      parsed = inputSchema.parse(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new UigToolError(
          "UIG_INPUT_INVALID",
          "Invalid project-context tool input",
        );
      }
      throw error;
    }
    try {
      return outputSchema.parse(await action(parsed));
    } catch (error) {
      if (error instanceof UigToolError) throw error;
      const code = projectContextCode(error);
      if (code) throw new UigToolError(code, publicProjectContextMessage(code));
      throw new UigToolError(
        "UIG_FILESYSTEM_FAILED",
        "Project context operation failed",
      );
    }
  };
}

function publicProjectContextMessage(
  code: ProjectContextError["code"],
): string {
  return `Project context operation failed with ${code}`;
}

const projectContextCodes = new Set<ProjectContextError["code"]>([
  "UI_CONTEXT_CONFIG_INVALID",
  "CONFIG_PATH_OUTSIDE_WORKSPACE",
  "CONFIG_SYMLINK_ESCAPES_WORKSPACE",
  "MULTIPLE_LOCKFILES_FOUND",
  "PACKAGE_MANAGER_UNSUPPORTED",
  "PUBLIC_FACADE_NOT_FOUND",
  "PUBLIC_IMPORT_SOURCE_UNRESOLVED",
  "PUBLIC_IMPORT_SOURCE_MISMATCH",
  "PUBLIC_TYPES_ENTRY_NOT_FOUND",
  "INSTALLED_PACKAGE_NOT_FOUND",
  "DUPLICATE_COMPONENT_ID",
  "MAPPING_TARGET_NOT_FOUND",
  "SEMANTIC_ROLE_UNKNOWN",
  "COMPONENT_CAPABILITY_UNKNOWN",
  "FORM_ADAPTER_UNKNOWN",
  "SCAN_DISCOVERY_STALE",
  "SELECTED_DESIGN_SYSTEM_PACK_NOT_FOUND",
  "PROJECT_SCAN_ALREADY_RUNNING",
  "PROJECT_SCAN_LOCK_UNCERTAIN",
  "PROJECT_COMPONENT_CATALOG_MISSING",
  "PROJECT_COMPONENT_CATALOG_STALE",
  "PROJECT_COMPONENT_NOT_FOUND",
  "CATALOG_ATOMIC_WRITE_FAILED",
  "PROJECT_CONTEXT_FILESYSTEM_FAILED",
]);

function projectContextCode(
  error: unknown,
): ProjectContextError["code"] | undefined {
  if (error instanceof ProjectContextError) return error.code;
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    typeof error.code !== "string"
  ) {
    return undefined;
  }
  return projectContextCodes.has(error.code as ProjectContextError["code"])
    ? (error.code as ProjectContextError["code"])
    : undefined;
}
