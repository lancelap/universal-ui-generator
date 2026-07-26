import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadDesignSystemPack } from "./load-pack.js";

const sberPack = fileURLToPath(
  new URL("../../../design-system-packs/sber-space-ui", import.meta.url),
);

describe("composition validation", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("rejects a missing required companion", async () => {
    const pack = await copyPack();
    const catalog = await json(join(pack, "catalog.json"));
    catalog.components[0].requiredComponentIds = ["base.Missing"];
    await save(join(pack, "catalog.json"), catalog);

    await expect(loadDesignSystemPack(pack)).rejects.toMatchObject({
      code: "RULE_REFERENCE_MISSING",
    });
  });

  it("rejects a required-component cycle", async () => {
    const pack = await copyPack();
    const catalog = await json(join(pack, "catalog.json"));
    const button = catalog.components.find(
      (entry: { id: string }) => entry.id === "base.Button",
    );
    const typography = catalog.components.find(
      (entry: { id: string }) => entry.id === "base.Typography",
    );
    button.requiredComponentIds = ["base.Typography"];
    typography.requiredComponentIds = ["base.Button"];
    await save(join(pack, "catalog.json"), catalog);

    await expect(loadDesignSystemPack(pack)).rejects.toMatchObject({
      code: "COMPOSITION_CYCLE_DETECTED",
    });
  });

  async function copyPack(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "uig-composition-"));
    roots.push(root);
    const pack = join(root, "pack");
    await cp(sberPack, pack, { recursive: true });
    return pack;
  }
});

async function json(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function save(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
