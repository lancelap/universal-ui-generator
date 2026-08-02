import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type EffectiveComponentCatalogV1,
  EffectiveComponentCatalogV1Schema,
  type InstalledPackagesV1,
  InstalledPackagesV1Schema,
  type ProjectComponentAnnotationsV1,
  ProjectComponentAnnotationsV1Schema,
  type ProjectComponentMappingsV1,
  ProjectComponentMappingsV1Schema,
  type ProjectComponentPoliciesV1,
  ProjectComponentPoliciesV1Schema,
  type ProjectScanDiagnostic,
  ProjectScanDiagnosticSchema,
  type PublicComponentsV1,
  PublicComponentsV1Schema,
  stableStringify,
  type UiContextConfigV1,
  UiContextConfigV1Schema,
  validateWithSchema,
  assertEffectiveComponentCatalogV1Integrity,
  assertPublicComponentsV1Integrity,
} from "@uig/contracts";
import {
  assertContainedOrdinaryPath,
  ensureContainedDirectoryTree,
} from "@uig/design-context";

import { ProjectContextError } from "./errors.js";

export interface HumanProjectContext {
  config: UiContextConfigV1;
  mappings: ProjectComponentMappingsV1;
  annotations: ProjectComponentAnnotationsV1;
  policies: ProjectComponentPoliciesV1;
  mappingsSha256: string;
}

export interface GeneratedProjectContextArtifacts {
  projectScan: { schema: "project-scan/v1"; [key: string]: unknown };
  installedPackages: InstalledPackagesV1;
  publicComponents: PublicComponentsV1;
  diagnostics: ProjectScanDiagnostic[];
  catalog: EffectiveComponentCatalogV1;
}

export interface ScanReservation {
  release(): Promise<void>;
}

export interface ProjectContextStore {
  readHumanContext(): Promise<HumanProjectContext | null>;
  initializeHumanContext(
    config: UiContextConfigV1,
  ): Promise<HumanProjectContext>;
  replaceMappings(input: {
    expectedSha256: string;
    mappings: ProjectComponentMappingsV1;
  }): Promise<{
    previous: ProjectComponentMappingsV1;
    previousSha256: string;
    writtenSha256: string;
  }>;
  acquireScanReservation(scanId: string): Promise<ScanReservation>;
  publishGenerated(input: GeneratedProjectContextArtifacts): Promise<{
    catalogPath: ".ui-context/generated/effective-component-catalog.json";
    catalogSha256: string;
  }>;
  readActiveCatalog(): Promise<EffectiveComponentCatalogV1 | null>;
  readPublicComponents(): Promise<PublicComponentsV1 | null>;
  publishFailedScan(input: {
    scanId: string;
    diagnostics: ProjectScanDiagnostic[];
  }): Promise<{
    artifactPath: ".ui-context/generated/failed-scan-diagnostics.json";
  }>;
}

export function createProjectContextStore(
  workspaceDir: string,
  hooks: {
    beforeCatalogRename?: () => void | Promise<void>;
    processIsAlive?: (pid: number) => boolean;
  } = {},
): ProjectContextStore {
  const contextDir = join(workspaceDir, ".ui-context");
  const generatedDir = join(contextDir, "generated");

  async function ensureContext(): Promise<void> {
    await ensureContainedDirectoryTree(workspaceDir, [".ui-context"]);
  }

  async function readHumanContext(): Promise<HumanProjectContext | null> {
    try {
      await assertContainedOrdinaryPath({
        baseDirectory: workspaceDir,
        relativePath: ".ui-context",
        expected: "directory",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const config = await readValidated("config.json", UiContextConfigV1Schema);
    const mappings = await readValidated(
      "mappings.json",
      ProjectComponentMappingsV1Schema,
    );
    const annotations = await readValidated(
      "annotations.json",
      ProjectComponentAnnotationsV1Schema,
    );
    const policies = await readValidated(
      "policies.json",
      ProjectComponentPoliciesV1Schema,
    );
    return {
      config,
      mappings,
      annotations,
      policies,
      mappingsSha256: hashBytes(bytes(mappings)),
    };
  }

  return {
    readHumanContext,

    async initializeHumanContext(config) {
      validateWithSchema(UiContextConfigV1Schema, config);
      await ensureContext();
      await writeIfMissing(".gitignore", "generated/\n");
      await writeJsonIfMissing("config.json", config, UiContextConfigV1Schema);
      await writeJsonIfMissing(
        "mappings.json",
        {
          schema: "project-component-mappings/v1",
          components: [],
          designComponents: [],
        },
        ProjectComponentMappingsV1Schema,
      );
      await writeJsonIfMissing(
        "annotations.json",
        {
          schema: "project-component-annotations/v1",
          components: [],
        },
        ProjectComponentAnnotationsV1Schema,
      );
      await writeJsonIfMissing(
        "policies.json",
        {
          schema: "project-component-policies/v1",
          resolution: {
            allowSuggested: false,
            allowNativeFallback: false,
            preferProjectComponents: true,
          },
          components: { excluded: [], deprecatedAllowed: false },
          imports: { preferPublicFacades: true, allowDeepImports: false },
        },
        ProjectComponentPoliciesV1Schema,
      );
      return (await readHumanContext())!;
    },

    async replaceMappings(input) {
      const current = await readValidated(
        "mappings.json",
        ProjectComponentMappingsV1Schema,
      );
      const currentBytes = bytes(current);
      const previousSha256 = hashBytes(currentBytes);
      if (previousSha256 !== input.expectedSha256) {
        throw new ProjectContextError(
          "PROJECT_COMPONENT_CATALOG_STALE",
          "Mappings changed since they were read",
        );
      }
      const mappings = validateWithSchema(
        ProjectComponentMappingsV1Schema,
        input.mappings,
      );
      const nextBytes = bytes(mappings);
      await writeAtomically(contextDir, "mappings.json", nextBytes);
      return {
        previous: current,
        previousSha256,
        writtenSha256: hashBytes(nextBytes),
      };
    },

    async acquireScanReservation(scanId) {
      await ensureContext();
      const lockPath = join(contextDir, ".scan-lock");
      const writeLock = () =>
        writeFile(
          lockPath,
          stableStringify({
            schema: "project-scan-lock/v1",
            scanId,
            pid: process.pid,
            startedAt: new Date().toISOString(),
          }),
          { flag: "wx" },
        );
      try {
        await writeLock();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const lock = await readScanLock(lockPath);
        const isAlive = hooks.processIsAlive ?? defaultProcessIsAlive;
        if (isAlive(lock.pid)) {
          throw new ProjectContextError(
            "PROJECT_SCAN_ALREADY_RUNNING",
            "A project component scan is already running",
          );
        }
        try {
          await lstat(join(contextDir, `scan-staging-${lock.scanId}`));
          throw new ProjectContextError(
            "PROJECT_SCAN_LOCK_UNCERTAIN",
            "Dead scan lock still has staging evidence",
          );
        } catch (stagingError) {
          if ((stagingError as NodeJS.ErrnoException).code !== "ENOENT") {
            throw stagingError;
          }
        }
        await unlink(lockPath);
        await writeLock();
      }
      let released = false;
      return {
        async release() {
          if (released) return;
          released = true;
          await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        },
      };
    },

    async publishGenerated(input) {
      validateGenerated(input, workspaceDir);
      await ensureContext();
      await ensureContainedDirectoryTree(contextDir, ["generated"]);
      const supporting = [
        ["project-scan.json", input.projectScan],
        ["installed-packages.json", input.installedPackages],
        ["public-components.json", input.publicComponents],
        ["diagnostics.json", input.diagnostics],
      ] as const;
      const catalogBytes = bytes(input.catalog);
      const temporaryName = `.tmp-catalog-${randomUUID()}`;
      await writeFile(join(generatedDir, temporaryName), catalogBytes, {
        flag: "wx",
      });
      const previous = new Map<string, Uint8Array | null>();
      for (const [name] of supporting) {
        try {
          previous.set(name, await readFile(join(generatedDir, name)));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          previous.set(name, null);
        }
      }
      try {
        for (const [name, value] of supporting) {
          await writeAtomically(generatedDir, name, bytes(value));
        }
        await hooks.beforeCatalogRename?.();
        await rename(
          join(generatedDir, temporaryName),
          join(generatedDir, "effective-component-catalog.json"),
        );
      } catch (error) {
        await unlink(join(generatedDir, temporaryName)).catch(() => undefined);
        for (const [name, content] of previous) {
          if (content === null) {
            await unlink(join(generatedDir, name)).catch(() => undefined);
          } else {
            await writeAtomically(generatedDir, name, content);
          }
        }
        throw error;
      }
      return {
        catalogPath: ".ui-context/generated/effective-component-catalog.json",
        catalogSha256: hashBytes(catalogBytes),
      };
    },

    async readActiveCatalog() {
      const path = join(generatedDir, "effective-component-catalog.json");
      try {
        const catalog = validateWithSchema(
          EffectiveComponentCatalogV1Schema,
          JSON.parse(await readFile(path, "utf8")),
        );
        assertEffectiveComponentCatalogV1Integrity(catalog);
        for (const reference of Object.values(catalog.artifacts)) {
          const artifactPath = await assertContainedOrdinaryPath({
            baseDirectory: workspaceDir,
            relativePath: reference.path,
            expected: "file",
          });
          if (hashBytes(await readFile(artifactPath)) !== reference.sha256) {
            throw new ProjectContextError(
              "CATALOG_ATOMIC_WRITE_FAILED",
              `Catalog supporting artifact hash mismatch: ${reference.path}`,
            );
          }
        }
        return catalog;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async readPublicComponents() {
      try {
        const path = await assertContainedOrdinaryPath({
          baseDirectory: workspaceDir,
          relativePath: ".ui-context/generated/public-components.json",
          expected: "file",
        });
        const publicComponents = validateWithSchema(
          PublicComponentsV1Schema,
          JSON.parse(await readFile(path, "utf8")),
        );
        assertPublicComponentsV1Integrity(publicComponents);
        return publicComponents;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async publishFailedScan(input) {
      for (const diagnostic of input.diagnostics) {
        validateWithSchema(ProjectScanDiagnosticSchema, diagnostic);
      }
      const artifact = {
        schema: "project-scan-failure/v1",
        scanId: input.scanId,
        diagnostics: input.diagnostics,
      };
      const serialized = stableStringify(artifact);
      if (
        serialized.includes(workspaceDir) ||
        /PIXSO_ACCESS_TOKEN|authorization|password|secret/i.test(serialized)
      ) {
        throw new ProjectContextError(
          "PROJECT_CONTEXT_FILESYSTEM_FAILED",
          "Failed scan diagnostics contain forbidden local or secret data",
        );
      }
      await ensureContext();
      await ensureContainedDirectoryTree(contextDir, ["generated"]);
      await writeAtomically(
        generatedDir,
        "failed-scan-diagnostics.json",
        new TextEncoder().encode(serialized),
      );
      return {
        artifactPath:
          ".ui-context/generated/failed-scan-diagnostics.json" as const,
      };
    },
  };

  async function readValidated<
    S extends Parameters<typeof validateWithSchema>[0],
  >(name: string, schema: S) {
    await assertContainedOrdinaryPath({
      baseDirectory: contextDir,
      relativePath: name,
      expected: "file",
    });
    return validateWithSchema(
      schema,
      JSON.parse(await readFile(join(contextDir, name), "utf8")),
    );
  }

  async function writeIfMissing(name: string, content: string): Promise<void> {
    try {
      await writeFile(join(contextDir, name), content, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  async function writeJsonIfMissing<
    S extends Parameters<typeof validateWithSchema>[0],
  >(name: string, value: unknown, schema: S): Promise<void> {
    validateWithSchema(schema, value);
    await writeIfMissing(name, stableStringify(value));
  }
}

async function writeAtomically(
  parent: string,
  name: string,
  content: Uint8Array,
): Promise<void> {
  const temporary = join(parent, `.tmp-${randomUUID()}`);
  await writeFile(temporary, content, { flag: "wx" });
  try {
    await rename(temporary, join(parent, name));
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function validateGenerated(
  input: GeneratedProjectContextArtifacts,
  workspace: string,
): void {
  validateWithSchema(InstalledPackagesV1Schema, input.installedPackages);
  validateWithSchema(PublicComponentsV1Schema, input.publicComponents);
  assertPublicComponentsV1Integrity(input.publicComponents);
  validateWithSchema(EffectiveComponentCatalogV1Schema, input.catalog);
  assertEffectiveComponentCatalogV1Integrity(input.catalog);
  const expectedHashes = {
    publicComponents: hashBytes(bytes(input.publicComponents)),
    installedPackages: hashBytes(bytes(input.installedPackages)),
    diagnostics: hashBytes(bytes(input.diagnostics)),
  };
  for (const [name, expected] of Object.entries(expectedHashes)) {
    const actual =
      input.catalog.artifacts[name as keyof typeof expectedHashes].sha256;
    if (actual !== expected) {
      throw new ProjectContextError(
        "CATALOG_ATOMIC_WRITE_FAILED",
        `Catalog supporting hash mismatch for ${name}`,
      );
    }
  }
  const serialized = stableStringify(input);
  if (
    serialized.includes(workspace) ||
    /PIXSO_ACCESS_TOKEN|authorization|password|secret/i.test(serialized)
  ) {
    throw new ProjectContextError(
      "PROJECT_CONTEXT_FILESYSTEM_FAILED",
      "Generated context contains forbidden local or secret data",
    );
  }
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(stableStringify(value));
}

function hashBytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readScanLock(
  path: string,
): Promise<{ scanId: string; pid: number }> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    if (
      value.schema !== "project-scan-lock/v1" ||
      typeof value.scanId !== "string" ||
      !/^[A-Za-z0-9._-]+$/.test(value.scanId) ||
      !Number.isSafeInteger(value.pid) ||
      (value.pid as number) <= 0
    ) {
      throw new Error("invalid lock");
    }
    return { scanId: value.scanId, pid: value.pid as number };
  } catch {
    throw new ProjectContextError(
      "PROJECT_SCAN_LOCK_UNCERTAIN",
      "Existing project scan lock cannot be proven safe to recover",
    );
  }
}

function defaultProcessIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
