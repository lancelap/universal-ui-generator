import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadDesignSystemPack, loadDesignSystemPackV2 } from "./load-pack.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sberPack = join(repoRoot, "design-system-packs", "sber-space-ui");
const muiPack = join(repoRoot, "design-system-packs", "material-ui");

describe("loadDesignSystemPack", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("loads distinct verified Sber and Material UI indexes", async () => {
    const [sber, mui] = await Promise.all([
      loadDesignSystemPack(sberPack),
      loadDesignSystemPack(muiPack),
    ]);

    expect(sber.manifest.id).not.toBe(mui.manifest.id);
    expect(sber.candidatesByRole.get("primaryAction")?.[0]?.id).toBe(
      "base.Button",
    );
    expect(mui.candidatesByRole.get("primaryAction")?.[0]?.id).toBe(
      "mui.Button",
    );
    expect(sber.candidatesByRole.get("primaryAction")?.[0]?.verified).toBe(
      true,
    );
    expect(mui.candidatesByRole.get("primaryAction")?.[0]?.verified).toBe(true);
    expect(sber.compositionRules.rules[0]?.slots).not.toEqual(
      mui.compositionRules.rules[0]?.slots,
    );
    expect(
      [...sber.exactPixsoMappings, ...mui.exactPixsoMappings].some(
        (mapping) => mapping.componentKey.length === 0,
      ),
    ).toBe(false);
  });

  it.each([
    ["Sber Space UI", sberPack],
    ["Material UI", muiPack],
  ])("loads the built-in %s pack as generation-ready v2", async (_, path) => {
    const pack = await loadDesignSystemPackV2(path);

    expect(pack.manifest.schema).toBe("design-system-pack/v2");
    expect(pack.reactRenderRecipes.components.length).toBeGreaterThan(0);
    expect(pack.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a manifest path that escapes the pack directory", async () => {
    const pack = await copyPack();
    const manifest = await readJson(join(pack, "pack.json"));
    manifest.files.catalog = "../outside.json";
    await writeJson(join(pack, "pack.json"), manifest);
    await writeJson(join(dirname(pack), "outside.json"), {
      schema: "component-catalog/v1",
      components: [],
    });

    await expect(loadDesignSystemPack(pack)).rejects.toMatchObject({
      code: "DESIGN_SYSTEM_PACK_INVALID",
    });
  });

  it("rejects duplicate component IDs", async () => {
    const pack = await copyPack();
    const catalog = await readJson(join(pack, "catalog.json"));
    catalog.components.push(structuredClone(catalog.components[0]));
    await writeJson(join(pack, "catalog.json"), catalog);

    await expect(loadDesignSystemPack(pack)).rejects.toMatchObject({
      code: "COMPONENT_CATALOG_ENTRY_INVALID",
    });
  });

  it("rejects an unknown semantic-policy component", async () => {
    const pack = await copyPack();
    const policy = await readJson(join(pack, "semantic-policy.json"));
    policy.roles.primaryAction.candidateComponentIds = ["base.Unknown"];
    await writeJson(join(pack, "semantic-policy.json"), policy);

    await expect(loadDesignSystemPack(pack)).rejects.toMatchObject({
      code: "RULE_REFERENCE_MISSING",
    });
  });

  it("rejects an unverified reuse candidate", async () => {
    const pack = await copyPack();
    const catalog = await readJson(join(pack, "catalog.json"));
    catalog.components[0].verified = false;
    await writeJson(join(pack, "catalog.json"), catalog);
    const verification = await readJson(join(pack, "verification.json"));
    verification.components[0].status = "unverified";
    await writeJson(join(pack, "verification.json"), verification);

    await expect(loadDesignSystemPack(pack)).rejects.toMatchObject({
      code: "COMPONENT_EXPORT_UNVERIFIED",
    });
  });

  it("rejects equal-priority candidates for one role", async () => {
    const pack = await copyPack();
    const catalog = await readJson(join(pack, "catalog.json"));
    const duplicate = structuredClone(catalog.components[0]);
    duplicate.id = "base.ButtonAlternative";
    catalog.components.push(duplicate);
    await writeJson(join(pack, "catalog.json"), catalog);
    const policy = await readJson(join(pack, "semantic-policy.json"));
    policy.roles.primaryAction.candidateComponentIds.push(duplicate.id);
    await writeJson(join(pack, "semantic-policy.json"), policy);
    const verification = await readJson(join(pack, "verification.json"));
    verification.components.push({
      componentId: duplicate.id,
      status: "verified",
      source: "test",
    });
    await writeJson(join(pack, "verification.json"), verification);

    await expect(loadDesignSystemPack(pack)).rejects.toMatchObject({
      code: "COMPONENT_CATALOG_ENTRY_INVALID",
    });
  });

  async function copyPack(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "uig-pack-"));
    temporaryRoots.push(root);
    const pack = join(root, "pack");
    await cp(sberPack, pack, { recursive: true });
    return pack;
  }
});

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
