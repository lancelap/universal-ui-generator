import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { scanInstalledPackages } from "./scan-installed-packages.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function put(root: string, path: string, content: string) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "uig-packages-"));
  roots.push(root);
  await put(
    root,
    "package.json",
    JSON.stringify({
      name: "fixture",
      dependencies: { "@company/ui": "1.2.3", missing: "1.0.0" },
    }),
  );
  await put(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  await put(
    root,
    "node_modules/@company/ui/package.json",
    JSON.stringify({
      name: "@company/ui",
      version: "1.2.3",
      exports: { ".": { types: "./index.d.ts" } },
      scripts: { postinstall: "touch ../../../../sentinel" },
    }),
  );
  await put(
    root,
    "node_modules/@company/ui/index.d.ts",
    "export declare const Button: (props: { label: string }) => unknown;\nexport declare const Upload: unknown;\n",
  );
  return root;
}

describe("scanInstalledPackages", () => {
  it("proves installed public type entries without scripts or network", async () => {
    const root = await fixture();
    const fetchSpy = vi.fn(() => {
      throw new Error("network forbidden");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await scanInstalledPackages({
      workspaceDir: root,
      packageJsonPath: join(root, "package.json"),
      lockfilePath: join(root, "pnpm-lock.yaml"),
    });
    expect(result.packages).toEqual([
      expect.objectContaining({
        name: "@company/ui",
        version: "1.2.3",
        packageJsonPath: "node_modules/@company/ui/package.json",
        publicTypeEntries: [
          expect.objectContaining({
            subpath: ".",
            path: "node_modules/@company/ui/index.d.ts",
            exports: ["Button", "Upload"],
          }),
        ],
      }),
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "INSTALLED_PACKAGE_NOT_FOUND",
        severity: "error",
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(
      import("node:fs/promises").then(({ access }) =>
        access(join(root, "sentinel")),
      ),
    ).rejects.toThrow();
  });

  it("produces stable hashes and ordering", async () => {
    const root = await fixture();
    const first = await scanInstalledPackages({
      workspaceDir: root,
      packageJsonPath: join(root, "package.json"),
      lockfilePath: join(root, "pnpm-lock.yaml"),
    });
    const second = await scanInstalledPackages({
      workspaceDir: root,
      packageJsonPath: join(root, "package.json"),
      lockfilePath: join(root, "pnpm-lock.yaml"),
    });
    expect(second).toEqual(first);
    expect(first.lockfile.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.packages[0]?.publicTypeEntries[0]?.sha256).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});
