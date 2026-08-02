import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { loadDesignSystemPackV2 } from "@uig/component-catalog";

import { buildEffectiveComponentCatalog } from "./build-effective-catalog.js";
import { fingerprintProjectContext } from "./fingerprint-context.js";
import { createProjectContextStore } from "./project-context-store.js";
import { contextInputs } from "./test-fixtures.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  ),
);

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "uig-store-"));
  roots.push(root);
  return root;
}

describe("ProjectContextStore", () => {
  it("initializes only human-owned files and managed ignore", async () => {
    const root = await workspace();
    const inputs = contextInputs();
    const store = createProjectContextStore(root);
    await store.initializeHumanContext(inputs.config);
    expect((await readdir(join(root, ".ui-context"))).sort()).toEqual([
      ".gitignore",
      "annotations.json",
      "config.json",
      "mappings.json",
      "policies.json",
    ]);
    expect(await readFile(join(root, ".ui-context/.gitignore"), "utf8")).toBe(
      "generated/\n",
    );
    await writeFile(join(root, ".ui-context/mappings.json"), "user-owned\n");
    await expect(store.initializeHumanContext(inputs.config)).rejects.toThrow();
    expect(
      await readFile(join(root, ".ui-context/mappings.json"), "utf8"),
    ).toBe("user-owned\n");
  });

  it("publishes supporting artifacts before the catalog and preserves prior authority on failure", async () => {
    const root = await workspace();
    const inputs = contextInputs();
    const pack = await loadDesignSystemPackV2(
      join(process.cwd(), "design-system-packs/sber-space-ui"),
    );
    const catalog = buildEffectiveComponentCatalog({
      fingerprint: fingerprintProjectContext(inputs),
      publicComponents: inputs.publicComponents,
      mappings: inputs.mappings,
      annotations: inputs.annotations,
      policies: inputs.policies,
      installedPackages: inputs.installedPackages,
      packs: [pack],
    });
    const store = createProjectContextStore(root);
    await store.initializeHumanContext(inputs.config);
    await store.publishGenerated({
      projectScan: { schema: "project-scan/v1" },
      installedPackages: inputs.installedPackages,
      publicComponents: inputs.publicComponents,
      diagnostics: [],
      catalog,
    });
    const catalogPath = join(
      root,
      ".ui-context/generated/effective-component-catalog.json",
    );
    const before = await readFile(catalogPath);
    const scanPath = join(root, ".ui-context/generated/project-scan.json");
    const supportingBefore = await readFile(scanPath);
    const failing = createProjectContextStore(root, {
      beforeCatalogRename: () => {
        throw new Error("injected");
      },
    });
    await expect(
      failing.publishGenerated({
        projectScan: { schema: "project-scan/v1", changed: true },
        installedPackages: inputs.installedPackages,
        publicComponents: inputs.publicComponents,
        diagnostics: [],
        catalog,
      }),
    ).rejects.toThrow(/injected/);
    expect(await readFile(catalogPath)).toEqual(before);
    expect(await readFile(scanPath)).toEqual(supportingBefore);
  });

  it("uses compare-and-swap for mappings", async () => {
    const root = await workspace();
    const inputs = contextInputs();
    const store = createProjectContextStore(root);
    const human = await store.initializeHumanContext(inputs.config);
    await expect(
      store.replaceMappings({
        expectedSha256: "0".repeat(64),
        mappings: inputs.mappings,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_COMPONENT_CATALOG_STALE" });
    const result = await store.replaceMappings({
      expectedSha256: human.mappingsSha256,
      mappings: inputs.mappings,
    });
    expect(result.writtenSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an active catalog whose supporting artifact hash changed", async () => {
    const root = await workspace();
    const inputs = contextInputs();
    const pack = await loadDesignSystemPackV2(
      join(process.cwd(), "design-system-packs/sber-space-ui"),
    );
    const catalog = buildEffectiveComponentCatalog({
      fingerprint: fingerprintProjectContext(inputs),
      publicComponents: inputs.publicComponents,
      mappings: inputs.mappings,
      annotations: inputs.annotations,
      policies: inputs.policies,
      installedPackages: inputs.installedPackages,
      packs: [pack],
    });
    const store = createProjectContextStore(root);
    await store.initializeHumanContext(inputs.config);
    await store.publishGenerated({
      projectScan: { schema: "project-scan/v1" },
      installedPackages: inputs.installedPackages,
      publicComponents: inputs.publicComponents,
      diagnostics: [],
      catalog,
    });
    await writeFile(
      join(root, ".ui-context/generated/public-components.json"),
      "{}\n",
    );
    await expect(store.readActiveCatalog()).rejects.toMatchObject({
      code: "CATALOG_ATOMIC_WRITE_FAILED",
    });
  });

  it("serializes scan reservations and rejects a context symlink", async () => {
    const root = await workspace();
    const store = createProjectContextStore(root);
    const reservation = await store.acquireScanReservation("scan-a");
    await expect(store.acquireScanReservation("scan-b")).rejects.toMatchObject({
      code: "PROJECT_SCAN_ALREADY_RUNNING",
    });
    await reservation.release();
    await expect(store.acquireScanReservation("scan-b")).resolves.toBeDefined();

    const escaped = await workspace();
    const outside = await workspace();
    await symlink(outside, join(escaped, ".ui-context"));
    await expect(
      createProjectContextStore(escaped).initializeHumanContext(
        contextInputs().config,
      ),
    ).rejects.toThrow(/ordinary|symbolic/i);
  });

  it("recovers only a proven dead scan lock and blocks an uncertain lock", async () => {
    const root = await workspace();
    const store = createProjectContextStore(root, {
      processIsAlive: () => false,
    });
    await store.initializeHumanContext(contextInputs().config);
    const lockPath = join(root, ".ui-context/.scan-lock");
    await writeFile(
      lockPath,
      JSON.stringify({
        schema: "project-scan-lock/v1",
        scanId: "dead",
        pid: 999999,
        startedAt: "2026-08-02T00:00:00.000Z",
      }),
    );
    const recovered = await store.acquireScanReservation("next");
    await recovered.release();

    await writeFile(lockPath, "not-json");
    await expect(store.acquireScanReservation("blocked")).rejects.toMatchObject(
      { code: "PROJECT_SCAN_LOCK_UNCERTAIN" },
    );
  });
});
