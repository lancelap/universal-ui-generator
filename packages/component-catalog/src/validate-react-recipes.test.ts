import { cp, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadDesignSystemPackV2 } from "./load-pack.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sourcePack = join(repoRoot, "design-system-packs", "sber-space-ui");

describe("loadDesignSystemPackV2", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("loads all React documents and returns a canonical pack hash", async () => {
    const packDirectory = await createV2Pack();

    const loaded = await loadDesignSystemPackV2(packDirectory);

    expect(loaded.manifest.schema).toBe("design-system-pack/v2");
    expect(loaded.reactRenderRecipes.components).toHaveLength(11);
    expect(loaded.reactStylePolicy.defaults.inlineStyles).toBe(false);
    expect(loaded.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a recipe for a missing component", async () => {
    const packDirectory = await createV2Pack();
    const recipes = await readJson(
      join(packDirectory, "react-render-recipes.json"),
    );
    promoteRecipesToV2(recipes);
    recipes.components.push({
      ...recipes.components[0],
      componentId: "base.Missing",
    });
    await writeJson(join(packDirectory, "react-render-recipes.json"), recipes);

    await expect(loadDesignSystemPackV2(packDirectory)).rejects.toMatchObject({
      code: "REACT_RECIPE_COMPONENT_MISSING",
    });
  });

  it("rejects an uncovered reusable component", async () => {
    const packDirectory = await createV2Pack();
    const recipes = await readJson(
      join(packDirectory, "react-render-recipes.json"),
    );
    recipes.components = recipes.components.filter(
      (recipe: { componentId: string }) => recipe.componentId !== "base.Button",
    );
    await writeJson(join(packDirectory, "react-render-recipes.json"), recipes);

    await expect(loadDesignSystemPackV2(packDirectory)).rejects.toMatchObject({
      code: "REACT_RECIPE_COMPONENT_UNCOVERED",
    });
  });

  it("rejects conflicting prop targets", async () => {
    const packDirectory = await createV2Pack();
    const recipes = await readJson(
      join(packDirectory, "react-render-recipes.json"),
    );
    const button = recipes.components.find(
      (recipe: { componentId: string }) => recipe.componentId === "base.Button",
    );
    button.content = { source: "content.label", target: "children" };
    button.classNameProp = "children";
    await writeJson(join(packDirectory, "react-render-recipes.json"), recipes);

    await expect(loadDesignSystemPackV2(packDirectory)).rejects.toMatchObject({
      code: "REACT_RECIPE_PROP_CONFLICT",
    });
  });

  it("rejects duplicate static prop targets", async () => {
    const packDirectory = await createV2Pack();
    const recipes = await readJson(
      join(packDirectory, "react-render-recipes.json"),
    );
    promoteRecipesToV2(recipes);
    const button = recipeFor(recipes, "base.Button");
    button.staticProps = [
      {
        target: "options",
        value: { kind: "empty-array" },
        reason: "render-only",
      },
      {
        target: "options",
        value: { kind: "empty-array" },
        reason: "render-only",
      },
    ];
    await writeJson(join(packDirectory, "react-render-recipes.json"), recipes);

    await expect(loadDesignSystemPackV2(packDirectory)).rejects.toMatchObject({
      code: "REACT_RECIPE_PROP_CONFLICT",
    });
  });

  it("rejects a noop static prop that is not an event target", async () => {
    const packDirectory = await createV2Pack();
    const recipes = await readJson(
      join(packDirectory, "react-render-recipes.json"),
    );
    promoteRecipesToV2(recipes);
    recipeFor(recipes, "base.Button").staticProps = [
      {
        target: "onChange",
        value: { kind: "noop" },
        reason: "render-only",
      },
    ];
    await writeJson(join(packDirectory, "react-render-recipes.json"), recipes);

    await expect(loadDesignSystemPackV2(packDirectory)).rejects.toMatchObject({
      code: "REACT_RECIPE_PROP_CONFLICT",
    });
  });

  it("allows a noop static prop to be a lower-precedence event default", async () => {
    const packDirectory = await createV2Pack();
    const recipes = await readJson(
      join(packDirectory, "react-render-recipes.json"),
    );
    promoteRecipesToV2(recipes);
    const button = recipeFor(recipes, "base.Button");
    button.staticProps = [
      {
        target: "onChange",
        value: { kind: "noop" },
        reason: "render-only",
      },
    ];
    button.eventProps.push({ source: "change", target: "onChange" });
    await writeJson(join(packDirectory, "react-render-recipes.json"), recipes);

    await expect(loadDesignSystemPackV2(packDirectory)).resolves.toMatchObject({
      reactRenderRecipes: {
        schema: "react-render-recipes/v2",
      },
    });
  });

  it("rejects an unknown v2 semantic children policy", async () => {
    const packDirectory = await createV2Pack();
    const recipes = await readJson(
      join(packDirectory, "react-render-recipes.json"),
    );
    promoteRecipesToV2(recipes);
    recipeFor(recipes, "base.Button").semanticChildrenPolicy = "guess";
    await writeJson(join(packDirectory, "react-render-recipes.json"), recipes);

    await expect(loadDesignSystemPackV2(packDirectory)).rejects.toMatchObject({
      code: "DESIGN_SYSTEM_PACK_INVALID",
    });
  });

  it("rejects a composition recipe that disagrees with its rule", async () => {
    const packDirectory = await createV2Pack();
    const recipes = await readJson(
      join(packDirectory, "react-render-recipes.json"),
    );
    recipes.compositions[0].rootComponentId = "base.Button";
    await writeJson(join(packDirectory, "react-render-recipes.json"), recipes);

    await expect(loadDesignSystemPackV2(packDirectory)).rejects.toMatchObject({
      code: "REACT_COMPOSITION_RECIPE_INVALID",
    });
  });

  it("rejects style rules for a missing component", async () => {
    const packDirectory = await createV2Pack();
    const policy = await readJson(
      join(packDirectory, "react-style-policy.json"),
    );
    policy.components.push({
      componentId: "base.Missing",
      layout: { allowed: [] },
      appearance: { allowed: [] },
      wrapper: "forbidden",
    });
    await writeJson(join(packDirectory, "react-style-policy.json"), policy);

    await expect(loadDesignSystemPackV2(packDirectory)).rejects.toMatchObject({
      code: "REACT_STYLE_COMPONENT_MISSING",
    });
  });

  it("keeps the hash stable across JSON key order and modification time", async () => {
    const packDirectory = await createV2Pack();
    const first = await loadDesignSystemPackV2(packDirectory);
    const recipesPath = join(packDirectory, "react-render-recipes.json");
    const recipes = await readJson(recipesPath);
    const reordered = {
      compositions: recipes.compositions,
      components: recipes.components,
      schema: recipes.schema,
    };
    await writeJson(recipesPath, reordered);
    await utimes(recipesPath, new Date(1_000), new Date(2_000));

    const second = await loadDesignSystemPackV2(packDirectory);

    expect(second.sha256).toBe(first.sha256);
  });

  it("hashes v1 recipes as their effective normalized v2 document", async () => {
    const packDirectory = await createV2Pack();
    const first = await loadDesignSystemPackV2(packDirectory);
    const recipesPath = join(packDirectory, "react-render-recipes.json");
    const recipes = await readJson(recipesPath);
    promoteRecipesToV2(recipes);
    await writeJson(recipesPath, recipes);

    const second = await loadDesignSystemPackV2(packDirectory);

    expect(second.sha256).toBe(first.sha256);
  });

  async function createV2Pack(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "uig-pack-v2-"));
    temporaryRoots.push(root);
    const packDirectory = join(root, "pack");
    await cp(sourcePack, packDirectory, { recursive: true });

    const manifest = await readJson(join(packDirectory, "pack.json"));
    manifest.schema = "design-system-pack/v2";
    manifest.version = "2.0.0";
    manifest.files.reactRenderRecipes = "react-render-recipes.json";
    manifest.files.reactStylePolicy = "react-style-policy.json";
    await writeJson(join(packDirectory, "pack.json"), manifest);

    const catalog = await readJson(join(packDirectory, "catalog.json"));
    await writeJson(join(packDirectory, "react-render-recipes.json"), {
      schema: "react-render-recipes/v1",
      components: catalog.components.map((component: { id: string }) => ({
        componentId: component.id,
        stateProps: [],
        eventProps: [],
        semanticChildrenPolicy: "optional",
        wrapper: "allowed",
        provenance: {
          kind: "verified-public-api",
          source: "test fixture declaration",
        },
      })),
      compositions: [
        {
          compositionId: "sber-dialog",
          rootComponentId: "base.Modal",
          slots: [
            {
              name: "heading",
              componentId: "base.ModalHeader",
              acceptsRoles: ["heading"],
              cardinality: "zero-or-one",
            },
            {
              name: "body",
              componentId: "base.ModalBody",
              acceptsRemaining: true,
              cardinality: "many",
            },
            {
              name: "actions",
              componentId: "base.ModalFooter",
              acceptsRoles: ["actionGroup"],
              cardinality: "zero-or-one",
            },
          ],
          provenance: {
            kind: "verified-public-api",
            source: "test fixture declaration",
          },
        },
      ],
    });
    await writeJson(join(packDirectory, "react-style-policy.json"), {
      schema: "react-style-policy/v1",
      defaults: {
        layout: {
          allowed: ["display", "flexDirection", "gap", "padding"],
        },
        appearance: { allowed: [] },
        internalSelectors: false,
        inlineStyles: false,
      },
      components: [],
      fallback: {
        layout: "all-supported",
        appearance: "all-supported",
      },
      provenance: {
        kind: "approved-pack-policy",
        source: "test fixture declaration",
      },
    });

    return packDirectory;
  }
});

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function promoteRecipesToV2(recipes: any): void {
  recipes.schema = "react-render-recipes/v2";
  recipes.components = recipes.components.map((recipe: any) => ({
    ...recipe,
    staticProps: [],
  }));
}

function recipeFor(recipes: any, componentId: string): any {
  return recipes.components.find(
    (recipe: { componentId: string }) => recipe.componentId === componentId,
  );
}
