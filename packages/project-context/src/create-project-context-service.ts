import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type {
  EffectiveCatalogFingerprint,
  ProjectScanDiagnostic,
  UiContextConfigV1,
} from "@uig/contracts";
import { loadDesignSystemPackV2 } from "@uig/component-catalog";
import {
  discoverProject,
  resolveConfiguredPublicRoots,
  scanInstalledPackages,
  scanPublicProject,
  type SemanticVocabulary,
} from "@uig/project-scanner";

import { buildEffectiveComponentCatalog } from "./build-effective-catalog.js";
import { ProjectContextError } from "./errors.js";
import {
  fingerprintProjectContext,
  type ContextFingerprintInputs,
} from "./fingerprint-context.js";
import {
  createProjectContextStore,
  type HumanProjectContext,
} from "./project-context-store.js";
import {
  applyMappingChanges,
  type ProjectComponentMappingChange,
} from "./mutate-mappings.js";
import {
  getComponentContractFromCatalog,
  getIconPathsFromCatalog,
  searchProjectContextCatalog,
} from "./query-project-context.js";

export type ProjectScanCommandResult =
  | {
      status: "needs-configuration";
      discoveryId: string;
      proposedConfig: UiContextConfigV1;
      diagnostics: ProjectScanDiagnostic[];
    }
  | {
      status: "completed";
      catalog: {
        path: ".ui-context/generated/effective-component-catalog.json";
        sha256: string;
        fingerprint: string;
      };
      summary: {
        verifiedComponents: number;
        verifiedIcons: number;
        mappedRoles: number;
        suggestedRoles: number;
        warnings: number;
      };
      diagnostics: {
        total: number;
        returned: ProjectScanDiagnostic[];
        truncated: boolean;
      };
    }
  | {
      status: "blocked";
      stage: "project-scan";
      diagnostics: {
        total: number;
        returned: ProjectScanDiagnostic[];
        truncated: boolean;
      };
      artifactPath: ".ui-context/generated/failed-scan-diagnostics.json";
    };

export interface ProjectUiContextStatus {
  status: "missing" | "ready" | "stale" | "blocked";
  changed: string[];
  catalog?: {
    path: ".ui-context/generated/effective-component-catalog.json";
    fingerprint: string;
  };
}

export interface ProjectContextService {
  scan(input: {
    acceptDiscoveredConfig?: boolean;
    discoveryId?: string;
    acceptedConfig?: UiContextConfigV1;
  }): Promise<ProjectScanCommandResult>;
  status(): Promise<ProjectUiContextStatus>;
  search(input: {
    query?: string;
    semanticRole?: string;
    status?: "suggested" | "mapped" | "pack-owned";
    limit?: number;
  }): Promise<ReturnType<typeof searchProjectContextCatalog>>;
  getComponentContract(input: {
    componentId: string;
  }): Promise<ReturnType<typeof getComponentContractFromCatalog>>;
  getIconPaths(input: {
    names: readonly string[];
  }): Promise<ReturnType<typeof getIconPathsFromCatalog>>;
  confirmMappings(
    input: MappingMutationCommand,
  ): Promise<ProjectMappingMutationResult>;
  removeMappings(
    input: MappingMutationCommand,
  ): Promise<ProjectMappingMutationResult>;
}

export interface MappingMutationCommand {
  catalogFingerprint: string;
  mappings: readonly ProjectComponentMappingChange[];
}

export interface ProjectMappingMutationResult {
  mappingPath: ".ui-context/mappings.json";
  catalogPath: ".ui-context/generated/effective-component-catalog.json";
  catalogSha256: string;
  catalogFingerprint: string;
  summary: {
    verifiedComponents: number;
    verifiedIcons: number;
    mappedRoles: number;
    suggestedRoles: number;
    warnings: number;
  };
}

export function createProjectContextService(input: {
  workspaceDir: string;
  extensionRoot: string;
  now?: () => Date;
  processIsAlive?: (pid: number) => boolean;
}): ProjectContextService {
  const store = createProjectContextStore(
    input.workspaceDir,
    input.processIsAlive ? { processIsAlive: input.processIsAlive } : {},
  );
  const now = input.now ?? (() => new Date());

  async function mutateMappings(
    operation: "confirm" | "remove",
    command: MappingMutationCommand,
  ): Promise<ProjectMappingMutationResult> {
    const human = await store.readHumanContext();
    const active = await requireActiveCatalog(store);
    if (!human) {
      throw new ProjectContextError(
        "PROJECT_COMPONENT_CATALOG_MISSING",
        "Project UI context is missing",
      );
    }
    const current = await buildCurrentInputs({
      workspaceDir: input.workspaceDir,
      extensionRoot: input.extensionRoot,
      human,
    });
    const currentFingerprint = fingerprintProjectContext(current.inputs);
    if (
      active.fingerprint.value !== currentFingerprint.value ||
      command.catalogFingerprint !== currentFingerprint.value
    ) {
      throw new ProjectContextError(
        "PROJECT_COMPONENT_CATALOG_STALE",
        "Project component catalog changed before mapping confirmation",
      );
    }
    const nextMappings = applyMappingChanges({
      current: human.mappings,
      changes: command.mappings,
      operation,
    });
    const replaced = await store.replaceMappings({
      expectedSha256: human.mappingsSha256,
      mappings: nextMappings,
    });
    try {
      const built = await buildCurrentContext({
        workspaceDir: input.workspaceDir,
        extensionRoot: input.extensionRoot,
        human: {
          ...human,
          mappings: nextMappings,
          mappingsSha256: replaced.writtenSha256,
        },
      });
      const published = await store.publishGenerated({
        projectScan: {
          schema: "project-scan/v1",
          scanId: createHash("sha256")
            .update(`mapping:${built.fingerprint.value}`)
            .digest("hex"),
          fingerprint: built.fingerprint.value,
        },
        installedPackages: built.inputs.installedPackages,
        publicComponents: built.inputs.publicComponents,
        diagnostics: built.catalog.diagnostics,
        catalog: built.catalog,
      });
      return {
        mappingPath: ".ui-context/mappings.json",
        catalogPath: published.catalogPath,
        catalogSha256: published.catalogSha256,
        catalogFingerprint: built.fingerprint.value,
        summary: built.catalog.summary,
      };
    } catch (error) {
      await store.replaceMappings({
        expectedSha256: replaced.writtenSha256,
        mappings: replaced.previous,
      });
      throw error;
    }
  }

  return {
    async scan(command) {
      const availablePackIds = await listPackIds(input.extensionRoot);
      let human = await store.readHumanContext();
      if (!human) {
        const discovery = await discoverProject({
          workspaceDir: input.workspaceDir,
          availablePackIds,
          defaultPackId: "sber-space-ui",
        });
        if (!command.acceptDiscoveredConfig) {
          return {
            status: "needs-configuration",
            discoveryId: discovery.discoveryId,
            proposedConfig: discovery.proposedConfig,
            diagnostics: discovery.diagnostics,
          };
        }
        if (!command.discoveryId || !command.acceptedConfig) {
          throw new ProjectContextError(
            "SCAN_DISCOVERY_STALE",
            "discoveryId and acceptedConfig are required",
          );
        }
        if (command.discoveryId !== discovery.discoveryId) {
          throw new ProjectContextError(
            "SCAN_DISCOVERY_STALE",
            "Project discovery changed before confirmation",
          );
        }
        assertSelectedPacks(command.acceptedConfig, availablePackIds);
        await resolveConfiguredPublicRoots({
          workspaceDir: input.workspaceDir,
          config: command.acceptedConfig,
        });
        human = await store.initializeHumanContext(command.acceptedConfig);
      }

      const scanId = createHash("sha256")
        .update(`${human.config.schema}:${now().toISOString()}`)
        .digest("hex");
      const reservation = await store.acquireScanReservation(scanId);
      try {
        const built = await buildCurrentContext({
          workspaceDir: input.workspaceDir,
          extensionRoot: input.extensionRoot,
          human,
        });
        const published = await store.publishGenerated({
          projectScan: {
            schema: "project-scan/v1",
            scanId,
            fingerprint: built.fingerprint.value,
          },
          installedPackages: built.inputs.installedPackages,
          publicComponents: built.inputs.publicComponents,
          diagnostics: built.catalog.diagnostics,
          catalog: built.catalog,
        });
        return {
          status: "completed",
          catalog: {
            path: published.catalogPath,
            sha256: published.catalogSha256,
            fingerprint: built.fingerprint.value,
          },
          summary: built.catalog.summary,
          diagnostics: boundedDiagnostics(built.catalog.diagnostics),
        };
      } catch (error) {
        if (!isBlockingCatalogError(error)) throw error;
        const diagnostics: ProjectScanDiagnostic[] = [
          {
            severity: "error",
            code: error.code,
            message: `Project component scan blocked with ${error.code}`,
          },
        ];
        const failed = await store.publishFailedScan({ scanId, diagnostics });
        return {
          status: "blocked",
          stage: "project-scan",
          diagnostics: boundedDiagnostics(diagnostics),
          artifactPath: failed.artifactPath,
        };
      } finally {
        await reservation.release();
      }
    },

    async status() {
      const human = await store.readHumanContext();
      if (!human) return { status: "missing", changed: [] };
      const active = await store.readActiveCatalog();
      if (!active) return { status: "missing", changed: [] };
      const current = await buildCurrentInputs({
        workspaceDir: input.workspaceDir,
        extensionRoot: input.extensionRoot,
        human,
      });
      const fingerprint = fingerprintProjectContext(current.inputs);
      const changed = changedFingerprintCategories(
        active.fingerprint,
        fingerprint,
      );
      return {
        status: changed.length === 0 ? "ready" : "stale",
        changed,
        catalog: {
          path: ".ui-context/generated/effective-component-catalog.json",
          fingerprint: active.fingerprint.value,
        },
      };
    },

    async search(query) {
      return searchProjectContextCatalog(
        await requireActiveCatalog(store),
        query,
      );
    },

    async getComponentContract(query) {
      const catalog = await requireActiveCatalog(store);
      const publicComponents = await store.readPublicComponents();
      return getComponentContractFromCatalog(
        catalog,
        query,
        publicComponents ?? undefined,
      );
    },

    async getIconPaths(query) {
      return getIconPathsFromCatalog(await requireActiveCatalog(store), query);
    },

    async confirmMappings(command) {
      return mutateMappings("confirm", command);
    },

    async removeMappings(command) {
      return mutateMappings("remove", command);
    },
  };
}

const blockingCatalogCodes = new Set([
  "DUPLICATE_COMPONENT_ID",
  "MAPPING_TARGET_NOT_FOUND",
  "SEMANTIC_ROLE_UNKNOWN",
  "COMPONENT_CAPABILITY_UNKNOWN",
  "FORM_ADAPTER_UNKNOWN",
]);

function isBlockingCatalogError(error: unknown): error is ProjectContextError {
  return (
    error instanceof ProjectContextError && blockingCatalogCodes.has(error.code)
  );
}

async function requireActiveCatalog(
  store: ReturnType<typeof createProjectContextStore>,
) {
  const catalog = await store.readActiveCatalog();
  if (!catalog) {
    throw new ProjectContextError(
      "PROJECT_COMPONENT_CATALOG_MISSING",
      "Run project component scan first",
    );
  }
  return catalog;
}

async function buildCurrentContext(input: {
  workspaceDir: string;
  extensionRoot: string;
  human: HumanProjectContext;
}) {
  const current = await buildCurrentInputs(input);
  const fingerprint = fingerprintProjectContext(current.inputs);
  const catalog = buildEffectiveComponentCatalog({
    fingerprint,
    publicComponents: current.inputs.publicComponents,
    mappings: current.inputs.mappings,
    annotations: current.inputs.annotations,
    policies: current.inputs.policies,
    installedPackages: current.inputs.installedPackages,
    packs: current.packs,
  });
  return { ...current, fingerprint, catalog };
}

async function buildCurrentInputs(input: {
  workspaceDir: string;
  extensionRoot: string;
  human: HumanProjectContext;
}) {
  const packs = await Promise.all(
    input.human.config.designSystemPacks.map((id) =>
      loadDesignSystemPackV2(
        join(input.extensionRoot, "design-system-packs", id),
      ),
    ),
  );
  const vocabulary: SemanticVocabulary = {
    roles: new Set(
      packs.flatMap((pack) => Object.keys(pack.semanticPolicy.roles)),
    ),
    capabilities: new Set(
      packs.flatMap((pack) =>
        [...pack.componentsById.values()].flatMap(
          (component) => component.capabilities,
        ),
      ),
    ),
    formAdapters: new Set(
      packs.flatMap((pack) =>
        [...pack.componentsById.values()].flatMap(
          (component) => component.formAdapters,
        ),
      ),
    ),
  };
  const resolvedRoots = await resolveConfiguredPublicRoots({
    workspaceDir: input.workspaceDir,
    config: input.human.config,
  });
  const [installedPackages, publicComponents] = await Promise.all([
    scanInstalledPackages({
      workspaceDir: input.workspaceDir,
      packageJsonPath: join(input.workspaceDir, "package.json"),
      lockfilePath: join(
        input.workspaceDir,
        await detectLockfilePath(input.workspaceDir),
      ),
    }),
    scanPublicProject({
      workspaceDir: input.workspaceDir,
      config: input.human.config,
      resolvedRoots,
      semanticVocabulary: vocabulary,
    }),
  ]);
  const inputs: ContextFingerprintInputs = {
    config: input.human.config,
    mappings: input.human.mappings,
    annotations: input.human.annotations,
    policies: input.human.policies,
    publicComponents,
    installedPackages,
    designSystemPacks: packs.map((pack) => ({
      id: pack.manifest.id,
      version: pack.manifest.version,
      sha256: pack.sha256,
    })),
  };
  return { inputs, packs };
}

async function listPackIds(extensionRoot: string): Promise<string[]> {
  const root = join(extensionRoot, "design-system-packs");
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function assertSelectedPacks(
  config: UiContextConfigV1,
  available: readonly string[],
): void {
  const known = new Set(available);
  for (const id of config.designSystemPacks) {
    if (!known.has(id)) {
      throw new ProjectContextError(
        "SELECTED_DESIGN_SYSTEM_PACK_NOT_FOUND",
        `Selected design-system pack is unavailable: ${id}`,
      );
    }
  }
}

async function detectLockfilePath(workspaceDir: string): Promise<string> {
  const entries = await readdir(workspaceDir);
  for (const name of ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]) {
    if (entries.includes(name)) return name;
  }
  throw new ProjectContextError(
    "PROJECT_CONTEXT_FILESYSTEM_FAILED",
    "Supported lockfile is missing",
  );
}

function changedFingerprintCategories(
  stored: EffectiveCatalogFingerprint,
  current: EffectiveCatalogFingerprint,
): string[] {
  const order = [
    "config",
    "project",
    "mappings",
    "annotations",
    "policies",
    "lockfile",
    "installedPackages",
    "designSystemPacks",
  ] as const;
  return order.filter((key) => {
    const left = stored.inputs[key];
    const right = current.inputs[key];
    return JSON.stringify(left) !== JSON.stringify(right);
  });
}

function boundedDiagnostics(diagnostics: ProjectScanDiagnostic[]) {
  return {
    total: diagnostics.length,
    returned: diagnostics.slice(0, 50),
    truncated: diagnostics.length > 50,
  };
}
