import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { stableStringify } from "@uig/contracts";

import { createProjectContextService } from "./create-project-context-service.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  ),
);

async function readyService() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "uig-mapping-"));
  roots.push(workspaceDir);
  await cp(
    resolve("packages/project-scanner/src/__fixtures__/react-public-api"),
    workspaceDir,
    { recursive: true },
  );
  await writeFile(
    join(workspaceDir, "package.json"),
    stableStringify({ name: "mapping-fixture", dependencies: {} }),
  );
  await writeFile(
    join(workspaceDir, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n",
  );
  const service = createProjectContextService({
    workspaceDir,
    extensionRoot: resolve("."),
  });
  const discovered = await service.scan({});
  if (discovered.status !== "needs-configuration")
    throw new Error("unexpected state");
  const scanned = await service.scan({
    acceptDiscoveredConfig: true,
    discoveryId: discovered.discoveryId,
    acceptedConfig: discovered.proposedConfig,
  });
  if (scanned.status !== "completed") throw new Error("unexpected state");
  return { workspaceDir, service, fingerprint: scanned.catalog.fingerprint };
}

const change = {
  componentId: "project:@/semantic#AppRadioGroup",
  semanticRoles: ["choicePanel"],
  capabilities: ["single-selection", "value", "change"],
  formAdapters: ["controlled"],
};

describe("fingerprint-bound mapping mutation", () => {
  it("rejects a stale fingerprint before changing mappings", async () => {
    const { workspaceDir, service } = await readyService();
    const before = await readFile(
      join(workspaceDir, ".ui-context/mappings.json"),
    );
    await expect(
      service.confirmMappings({
        catalogFingerprint: "0".repeat(64),
        mappings: [change],
      }),
    ).rejects.toMatchObject({ code: "PROJECT_COMPONENT_CATALOG_STALE" });
    expect(
      await readFile(join(workspaceDir, ".ui-context/mappings.json")),
    ).toEqual(before);
  });

  it("confirms and removes one reviewed semantic binding", async () => {
    const { service, fingerprint } = await readyService();
    const confirmed = await service.confirmMappings({
      catalogFingerprint: fingerprint,
      mappings: [change],
    });
    expect(confirmed.catalogFingerprint).not.toBe(fingerprint);
    const contract = await service.getComponentContract({
      componentId: change.componentId,
    });
    expect(contract.semantics).toContainEqual(
      expect.objectContaining({
        role: "choicePanel",
        status: "mapped",
        confidence: 1,
      }),
    );
    expect(contract.contract).toMatchObject({
      propsType: "AppRadioGroupProps",
      props: expect.arrayContaining([
        expect.objectContaining({ name: "options", required: true }),
      ]),
    });

    const removed = await service.removeMappings({
      catalogFingerprint: confirmed.catalogFingerprint,
      mappings: [change],
    });
    expect(removed.catalogFingerprint).not.toBe(confirmed.catalogFingerprint);
    expect(
      (await service.getComponentContract({ componentId: change.componentId }))
        .semantics,
    ).toContainEqual(
      expect.objectContaining({ role: "choicePanel", status: "suggested" }),
    );
  });

  it("rolls back the human file when catalog rebuild rejects a term", async () => {
    const { workspaceDir, service, fingerprint } = await readyService();
    const before = await readFile(
      join(workspaceDir, ".ui-context/mappings.json"),
    );
    await expect(
      service.confirmMappings({
        catalogFingerprint: fingerprint,
        mappings: [{ ...change, semanticRoles: ["unknownRole"] }],
      }),
    ).rejects.toMatchObject({ code: "SEMANTIC_ROLE_UNKNOWN" });
    expect(
      await readFile(join(workspaceDir, ".ui-context/mappings.json")),
    ).toEqual(before);
  });
});
