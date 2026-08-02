import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverProject } from "./discover-project.js";

const workspaces: string[] = [];
afterEach(async () =>
  Promise.all(
    workspaces
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  ),
);

async function put(root: string, path: string, contents: string) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function workspace(
  input: {
    dependencies?: Record<string, string>;
    lockfiles?: string[];
    tsconfig?: unknown | null;
    files?: Record<string, string>;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "uig-discovery-"));
  workspaces.push(root);
  await put(
    root,
    "package.json",
    JSON.stringify({
      name: "customer-portal",
      dependencies: input.dependencies ?? {},
    }),
  );
  for (const lockfile of input.lockfiles ?? ["pnpm-lock.yaml"]) {
    await put(
      root,
      lockfile,
      lockfile === "pnpm-lock.yaml" ? "lockfileVersion: '9.0'\n" : "{}",
    );
  }
  if (input.tsconfig !== null) {
    await put(
      root,
      "tsconfig.json",
      JSON.stringify(
        input.tsconfig ?? {
          compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
          include: ["src"],
        },
      ),
    );
  }
  for (const [path, contents] of Object.entries(input.files ?? {}))
    await put(root, path, contents);
  return root;
}

async function tree(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string, prefix = "") {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      output.push(relative);
      if (entry.isDirectory())
        await visit(join(directory, entry.name), relative);
    }
  }
  await visit(root);
  return output;
}

const call = (
  root: string,
  packs: readonly string[] = ["mui", "sber-space-ui"],
) =>
  discoverProject({
    workspaceDir: root,
    availablePackIds: packs,
    defaultPackId: "sber-space-ui",
  });

describe("discoverProject", () => {
  it("proposes an aliased public facade and installed Sber pack", async () => {
    const root = await workspace({
      dependencies: { "@sber-space-ui/button": "2.0.0" },
      files: {
        "src/shared/ui/index.ts": 'export { Button } from "./Button";\n',
        "src/shared/ui/Button.tsx": "export const Button = () => null;\n",
      },
    });
    const result = await call(root);
    expect(result).toMatchObject({
      schema: "project-discovery/v1",
      packageManager: "pnpm",
      packageName: "customer-portal",
      lockfilePath: "pnpm-lock.yaml",
      tsconfigPath: "tsconfig.json",
      proposedConfig: {
        designSystemPacks: ["sber-space-ui"],
        componentRoots: [
          {
            path: "src/shared/ui",
            entry: "src/shared/ui/index.ts",
            importSource: "@/shared/ui",
          },
        ],
      },
    });
    expect(result.discoveryId).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evidencePaths).toEqual([
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.json",
      "src/shared/ui/index.ts",
    ]);
  });

  it("does not write during discovery", async () => {
    const root = await workspace({
      files: { "src/ui/index.ts": "export {};\n" },
    });
    const before = await tree(root);
    await call(root);
    expect(await tree(root)).toEqual(before);
  });

  it("rejects multiple competing lockfiles", async () => {
    const root = await workspace({
      lockfiles: ["pnpm-lock.yaml", "package-lock.json"],
    });
    await expect(call(root)).rejects.toMatchObject({
      code: "MULTIPLE_LOCKFILES_FOUND",
    });
  });

  it("rejects a Bun-only project", async () => {
    const root = await workspace({ lockfiles: ["bun.lock"] });
    await expect(call(root)).rejects.toMatchObject({
      code: "PACKAGE_MANAGER_UNSUPPORTED",
    });
  });

  it("reports an absent tsconfig", async () => {
    const root = await workspace({ tsconfig: null });
    await expect(call(root)).rejects.toMatchObject({
      code: "UI_CONTEXT_CONFIG_INVALID",
    });
  });

  it("uses the visible default pack and no roots when nothing matches", async () => {
    const result = await call(await workspace());
    expect(result.proposedConfig.designSystemPacks).toEqual(["sber-space-ui"]);
    expect(result.proposedConfig.componentRoots).toEqual([]);
  });

  it("orders roots and detected packs deterministically", async () => {
    const root = await workspace({
      dependencies: {
        "@mui/material": "7.0.0",
        "@sber-space-ui/button": "2.0.0",
      },
      files: {
        "src/z/index.ts": "export {};\n",
        "src/a/index.tsx": "export {};\n",
      },
    });
    const first = await call(root, ["sber-space-ui", "mui"]);
    const second = await call(root, ["mui", "sber-space-ui"]);
    expect(first.proposedConfig.designSystemPacks).toEqual([
      "mui",
      "sber-space-ui",
    ]);
    expect(
      first.proposedConfig.componentRoots.map((entry) => entry.path),
    ).toEqual(["src/a", "src/z"]);
    expect(second.discoveryId).toBe(first.discoveryId);
  });
});
