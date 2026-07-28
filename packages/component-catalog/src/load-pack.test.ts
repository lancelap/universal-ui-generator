import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  type ReactRenderRecipesV1,
  type ReactRenderRecipesV2,
  ReactRenderRecipesSchema,
  validateWithSchema,
} from "@uig/contracts";

import { loadDesignSystemPack, loadDesignSystemPackV2 } from "./load-pack.js";
import { normalizeReactRenderRecipes } from "./normalize-react-recipes.js";

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

  it("normalizes a v1 recipe document to v2 without mutating it", () => {
    const v1: ReactRenderRecipesV1 = {
      schema: "react-render-recipes/v1",
      components: [
        {
          componentId: "base.Button",
          stateProps: [],
          eventProps: [],
          semanticChildrenPolicy: "optional",
          wrapper: "allowed",
          provenance: { kind: "test", source: "fixture" },
        },
      ],
      compositions: [],
    };

    expect(normalizeReactRenderRecipes(v1)).toEqual({
      schema: "react-render-recipes/v2",
      components: [
        {
          ...v1.components[0],
          staticProps: [],
        },
      ],
      compositions: v1.compositions,
    });
    expect(v1).toEqual({
      schema: "react-render-recipes/v1",
      components: [
        {
          componentId: "base.Button",
          stateProps: [],
          eventProps: [],
          semanticChildrenPolicy: "optional",
          wrapper: "allowed",
          provenance: { kind: "test", source: "fixture" },
        },
      ],
      compositions: [],
    });
  });

  it("clones a validated v2 recipe document without changing its bytes", () => {
    const v2: ReactRenderRecipesV2 = {
      schema: "react-render-recipes/v2",
      components: [
        {
          componentId: "base.Button",
          staticProps: [
            {
              target: "options",
              value: { kind: "empty-array" },
              reason: "render-only",
            },
          ],
          stateProps: [],
          eventProps: [],
          semanticChildrenPolicy: "render-only-optional",
          wrapper: "allowed",
          provenance: { kind: "test", source: "fixture" },
        },
      ],
      compositions: [],
    };
    const validated = validateWithSchema(ReactRenderRecipesSchema, v2);
    const normalized = normalizeReactRenderRecipes(validated);

    expect(JSON.stringify(normalized)).toBe(JSON.stringify(v2));
    normalized.components[0]?.staticProps.push({
      target: "onChange",
      value: { kind: "noop" },
      reason: "render-only",
    });
    expect(v2.components[0]?.staticProps).toHaveLength(1);
  });

  it("loads and retains a v2 action-group projection", async () => {
    const pack = await copyPack();
    const pixsoMap = await readJson(join(pack, "pixso-map.json"));
    const actionGroup = pixsoMap.mappings.find(
      (mapping: any) => mapping.role === "actionGroup",
    );
    pixsoMap.schema = "pixso-map/v2";
    actionGroup.projection = {
      kind: "action-group",
      candidate: "button-shape-with-visible-label",
      order: "visual",
      roles: ["secondaryAction", "primaryAction"],
    };
    await writeJson(join(pack, "pixso-map.json"), pixsoMap);

    const loaded = await loadDesignSystemPackV2(pack);

    expect(
      loaded.exactPixsoMappings.find(
        (mapping) => mapping.role === "actionGroup",
      ),
    ).toMatchObject({
      projection: {
        kind: "action-group",
        roles: ["secondaryAction", "primaryAction"],
      },
    });
  });

  it.each([
    ["non-group kind", { kind: "content" }],
    ["non-action-group role", { role: "horizontalGroup" }],
    [
      "duplicate roles",
      { projectionRoles: ["primaryAction", "primaryAction"] },
    ],
  ])("rejects v2 projection with %s", async (_case, change) => {
    const update = change as {
      kind?: string;
      role?: string;
      projectionRoles?: string[];
    };
    const pack = await copyPack();
    const pixsoMap = await readJson(join(pack, "pixso-map.json"));
    const actionGroup = pixsoMap.mappings.find(
      (mapping: any) => mapping.role === "actionGroup",
    );
    pixsoMap.schema = "pixso-map/v2";
    actionGroup.kind = update.kind ?? actionGroup.kind;
    actionGroup.role = update.role ?? actionGroup.role;
    actionGroup.projection = {
      kind: "action-group",
      candidate: "button-shape-with-visible-label",
      order: "visual",
      roles: update.projectionRoles ?? ["secondaryAction", "primaryAction"],
    };
    await writeJson(join(pack, "pixso-map.json"), pixsoMap);

    await expect(loadDesignSystemPackV2(pack)).rejects.toMatchObject({
      code: "DESIGN_SYSTEM_PACK_INVALID",
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
