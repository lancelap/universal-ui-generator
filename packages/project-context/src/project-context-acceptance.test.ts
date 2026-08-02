import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createProjectContextService } from "./create-project-context-service.js";
import { createProjectContextStore } from "./project-context-store.js";

const roots: string[] = [];
const repositoryRoot = resolve(".");
const fixtureRoot = resolve("fixtures/projects/project-context-basic");
const appRadioGroupId = "project:@/shared/ui#AppRadioGroup";
const mapping = {
  componentId: appRadioGroupId,
  semanticRoles: ["choicePanel"],
  capabilities: ["single-selection", "value", "change"],
  formAdapters: ["controlled"],
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("project component context acceptance", () => {
  it("maintains verified authority through discovery, mapping, stale, and blocked states", async () => {
    const workspace = await copyAcceptanceProject();
    const service = createProjectContextService({
      workspaceDir: workspace,
      extensionRoot: repositoryRoot,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
    });

    const discovered = await service.scan({});
    expect(discovered.status).toBe("needs-configuration");
    expect(await pathExists(join(workspace, ".ui-context"))).toBe(false);
    if (discovered.status !== "needs-configuration")
      throw new Error("unexpected state");

    const scanned = await service.scan({
      acceptDiscoveredConfig: true,
      discoveryId: discovered.discoveryId,
      acceptedConfig: discovered.proposedConfig,
    });
    expect(scanned.status).toBe("completed");
    if (scanned.status !== "completed") throw new Error("unexpected state");
    expect((await readdir(join(workspace, ".ui-context"))).sort()).toEqual([
      ".gitignore",
      "annotations.json",
      "config.json",
      "generated",
      "mappings.json",
      "policies.json",
    ]);
    expect(
      (await readdir(join(workspace, ".ui-context/generated"))).sort(),
    ).toEqual([
      "diagnostics.json",
      "effective-component-catalog.json",
      "installed-packages.json",
      "project-scan.json",
      "public-components.json",
    ]);

    const store = createProjectContextStore(workspace);
    const initialCatalog = await store.readActiveCatalog();
    if (!initialCatalog) throw new Error("catalog missing");
    expect(initialCatalog.components.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        appRadioGroupId,
        "project:@/shared/ui#Button",
        "project:@/components#FilterPanel",
      ]),
    );
    expect(initialCatalog.icons.map((entry) => entry.id)).toContain(
      "project:@/shared/icons#Upload",
    );
    expect(JSON.stringify(initialCatalog)).not.toContain("InternalOption");
    expect(
      initialCatalog.components.find((entry) => entry.id === appRadioGroupId)
        ?.semantics,
    ).toContainEqual(
      expect.objectContaining({
        role: "choicePanel",
        status: "suggested",
        confidence: 0.86,
      }),
    );

    const unchanged = await service.scan({});
    expect(unchanged).toMatchObject({
      status: "completed",
      catalog: { fingerprint: scanned.catalog.fingerprint },
    });

    const confirmed = await service.confirmMappings({
      catalogFingerprint: scanned.catalog.fingerprint,
      mappings: [mapping],
    });
    expect(confirmed.catalogFingerprint).not.toBe(scanned.catalog.fingerprint);
    expect(
      (await service.getComponentContract({ componentId: appRadioGroupId }))
        .semantics,
    ).toContainEqual(
      expect.objectContaining({
        role: "choicePanel",
        status: "mapped",
        confidence: 1,
      }),
    );

    const componentPath = join(workspace, "src/shared/ui/AppRadioGroup.tsx");
    await writeFile(
      componentPath,
      (await readFile(componentPath, "utf8")).replace(
        "value: string;",
        "value: string;\n  disabled?: boolean;",
      ),
    );
    expect(await service.status()).toMatchObject({
      status: "stale",
      changed: ["project"],
    });
    await expect(
      service.confirmMappings({
        catalogFingerprint: confirmed.catalogFingerprint,
        mappings: [mapping],
      }),
    ).rejects.toMatchObject({ code: "PROJECT_COMPONENT_CATALOG_STALE" });

    const rescanned = await service.scan({});
    expect(rescanned.status).toBe("completed");
    if (rescanned.status !== "completed") throw new Error("unexpected state");
    expect(rescanned.catalog.fingerprint).not.toBe(
      confirmed.catalogFingerprint,
    );
    expect(await service.status()).toMatchObject({
      status: "ready",
      changed: [],
    });

    const catalogPath = join(
      workspace,
      ".ui-context/generated/effective-component-catalog.json",
    );
    const priorAuthority = await readFile(catalogPath);
    const facadePath = join(workspace, "src/shared/ui/index.ts");
    await writeFile(
      facadePath,
      (await readFile(facadePath, "utf8")).replace(
        'export { AppRadioGroup } from "./AppRadioGroup";\n',
        "",
      ),
    );
    const blocked = await service.scan({});
    expect(blocked).toMatchObject({
      status: "blocked",
      diagnostics: {
        returned: [
          expect.objectContaining({ code: "MAPPING_TARGET_NOT_FOUND" }),
        ],
      },
    });
    expect(await readFile(catalogPath)).toEqual(priorAuthority);

    const generatedText = (
      await Promise.all(
        (await readdir(join(workspace, ".ui-context/generated"))).map((name) =>
          readFile(join(workspace, ".ui-context/generated", name), "utf8"),
        ),
      )
    ).join("\n");
    expect(generatedText).not.toContain(workspace);
    expect(generatedText).not.toContain("acceptance-sentinel-secret");
  });
});

async function copyAcceptanceProject(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "uig-context-acceptance-"));
  roots.push(workspace);
  await cp(fixtureRoot, workspace, { recursive: true });
  return workspace;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await import("node:fs/promises").then(({ access }) => access(path));
    return true;
  } catch {
    return false;
  }
}
