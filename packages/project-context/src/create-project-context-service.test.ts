import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { stableStringify } from "@uig/contracts";

import { createProjectContextService } from "./create-project-context-service.js";

const roots: string[] = [];
const extensionRoot = resolve(".");
const sourceFixture = resolve(
  "packages/project-scanner/src/__fixtures__/react-public-api",
);

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixtureWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "uig-service-"));
  roots.push(root);
  await cp(sourceFixture, root, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    stableStringify({ name: "service-fixture", dependencies: {} }),
  );
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  return root;
}

describe("createProjectContextService", () => {
  it("discovers without writes, then scans only with the current discovery ID", async () => {
    const workspaceDir = await fixtureWorkspace();
    const service = createProjectContextService({
      workspaceDir,
      extensionRoot,
    });
    const first = await service.scan({});
    expect(first.status).toBe("needs-configuration");
    expect(await exists(join(workspaceDir, ".ui-context"))).toBe(false);
    if (first.status !== "needs-configuration")
      throw new Error("unexpected state");

    const completed = await service.scan({
      acceptDiscoveredConfig: true,
      discoveryId: first.discoveryId,
      acceptedConfig: first.proposedConfig,
    });
    expect(completed).toMatchObject({
      status: "completed",
      catalog: {
        path: ".ui-context/generated/effective-component-catalog.json",
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(await service.status()).toMatchObject({
      status: "ready",
      changed: [],
    });
  });

  it("rejects a stale discovery before writing human files", async () => {
    const workspaceDir = await fixtureWorkspace();
    const service = createProjectContextService({
      workspaceDir,
      extensionRoot,
    });
    const first = await service.scan({});
    if (first.status !== "needs-configuration")
      throw new Error("unexpected state");
    await writeFile(
      join(workspaceDir, "src/shared/ui/index.ts"),
      `${await readFile(join(workspaceDir, "src/shared/ui/index.ts"), "utf8")}\nexport const Changed = 1;\n`,
    );
    await expect(
      service.scan({
        acceptDiscoveredConfig: true,
        discoveryId: first.discoveryId,
        acceptedConfig: first.proposedConfig,
      }),
    ).rejects.toMatchObject({ code: "SCAN_DISCOVERY_STALE" });
    expect(await exists(join(workspaceDir, ".ui-context"))).toBe(false);
  });

  it.each([
    ["project", "src/shared/ui/components.ts"],
    ["lockfile", "pnpm-lock.yaml"],
  ] as const)(
    "reports %s fingerprint staleness without writing",
    async (category, path) => {
      const workspaceDir = await fixtureWorkspace();
      const service = createProjectContextService({
        workspaceDir,
        extensionRoot,
      });
      const first = await service.scan({});
      if (first.status !== "needs-configuration")
        throw new Error("unexpected state");
      await service.scan({
        acceptDiscoveredConfig: true,
        discoveryId: first.discoveryId,
        acceptedConfig: first.proposedConfig,
      });
      const target = join(workspaceDir, path);
      const before = await readFile(target, "utf8");
      await writeFile(
        target,
        category === "project"
          ? before.replace("disabled?: boolean", "disabled: boolean")
          : `${before}\n# changed\n`,
      );
      expect(await service.status()).toMatchObject({
        status: "stale",
        changed: [category],
      });
    },
  );

  it("reports mapping staleness independently", async () => {
    const workspaceDir = await fixtureWorkspace();
    const service = createProjectContextService({
      workspaceDir,
      extensionRoot,
    });
    const first = await service.scan({});
    if (first.status !== "needs-configuration")
      throw new Error("unexpected state");
    await service.scan({
      acceptDiscoveredConfig: true,
      discoveryId: first.discoveryId,
      acceptedConfig: first.proposedConfig,
    });
    await writeFile(
      join(workspaceDir, ".ui-context/mappings.json"),
      stableStringify({
        schema: "project-component-mappings/v1",
        components: [],
        designComponents: [
          {
            provider: "pixso",
            designSystem: "sber-space-ui",
            componentKey: "reviewed-key",
            componentId: "project:@/shared/ui#ArrowButton",
            status: "mapped",
          },
        ],
      }),
    );
    expect(await service.status()).toMatchObject({
      status: "stale",
      changed: ["mappings"],
    });
  });
});

async function exists(path: string): Promise<boolean> {
  try {
    await import("node:fs/promises").then(({ access }) => access(path));
    return true;
  } catch {
    return false;
  }
}
