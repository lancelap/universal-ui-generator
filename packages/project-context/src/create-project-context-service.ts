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
      artifactPath: ".ui-context/generated/diagnostics.json";
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
  };
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
