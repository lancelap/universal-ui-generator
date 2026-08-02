import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { UiContextConfigV1 } from "@uig/contracts";

import { resolveConfiguredPublicRoots } from "./resolve-public-entry.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  ),
);

async function put(root: string, path: string, contents: string) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "uig-roots-"));
  roots.push(root);
  await put(
    root,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
      include: ["src"],
    }),
  );
  await put(
    root,
    "src/shared/ui/index.ts",
    'export { Button } from "./Button";\n',
  );
  await put(
    root,
    "src/shared/ui/Button.tsx",
    "export const Button = () => null;\n",
  );
  return root;
}

function config(
  overrides: Partial<UiContextConfigV1["componentRoots"][number]> = {},
): UiContextConfigV1 {
  return {
    schema: "ui-context-config/v1",
    framework: "react",
    language: "typescript",
    designSystemPacks: ["sber-space-ui"],
    componentRoots: [
      {
        path: "src/shared/ui",
        entry: "src/shared/ui/index.ts",
        importSource: "@/shared/ui",
        ...overrides,
      },
    ],
    iconRoots: [],
    workspacePackages: { discovery: "public-exports" },
    ignore: [],
  };
}

describe("resolveConfiguredPublicRoots", () => {
  it("proves an alias resolves to the configured facade", async () => {
    const root = await fixture();
    const canonicalRoot = await realpath(root);
    await expect(
      resolveConfiguredPublicRoots({ workspaceDir: root, config: config() }),
    ).resolves.toEqual([
      {
        kind: "component",
        path: "src/shared/ui",
        entry: "src/shared/ui/index.ts",
        importSource: "@/shared/ui",
        absoluteEntryPath: join(canonicalRoot, "src/shared/ui/index.ts"),
      },
    ]);
  });

  it.each([
    ["../ui", "CONFIG_PATH_OUTSIDE_WORKSPACE"],
    ["/tmp/ui", "CONFIG_PATH_OUTSIDE_WORKSPACE"],
    ["src/shared/ui/missing.ts", "PUBLIC_FACADE_NOT_FOUND"],
  ])("rejects unsafe or missing entry %s", async (entry, code) => {
    const root = await fixture();
    await expect(
      resolveConfiguredPublicRoots({
        workspaceDir: root,
        config: config({ entry }),
      }),
    ).rejects.toMatchObject({ code });
  });

  it("rejects an import alias that resolves to a different file", async () => {
    const root = await fixture();
    await put(root, "src/other/index.ts", "export {};\n");
    await expect(
      resolveConfiguredPublicRoots({
        workspaceDir: root,
        config: config({ importSource: "@/other" }),
      }),
    ).rejects.toMatchObject({ code: "PUBLIC_IMPORT_SOURCE_MISMATCH" });
  });

  it("rejects an unresolved public import source", async () => {
    const root = await fixture();
    await expect(
      resolveConfiguredPublicRoots({
        workspaceDir: root,
        config: config({ importSource: "@company/missing" }),
      }),
    ).rejects.toMatchObject({ code: "PUBLIC_IMPORT_SOURCE_UNRESOLVED" });
  });

  it("rejects a root symlink that escapes the workspace", async () => {
    const root = await fixture();
    const external = await mkdtemp(join(tmpdir(), "uig-external-"));
    roots.push(external);
    await put(external, "index.ts", "export {};\n");
    await rm(join(root, "src/shared/ui"), { recursive: true });
    await symlink(external, join(root, "src/shared/ui"));
    await expect(
      resolveConfiguredPublicRoots({ workspaceDir: root, config: config() }),
    ).rejects.toMatchObject({ code: "CONFIG_SYMLINK_ESCAPES_WORKSPACE" });
  });
});
