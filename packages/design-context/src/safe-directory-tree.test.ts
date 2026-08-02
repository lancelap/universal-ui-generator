import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { assertContainedOrdinaryPath } from "./safe-directory-tree.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  ),
);

it("accepts an ordinary contained file and rejects traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "uig-contained-"));
  roots.push(root);
  await mkdir(join(root, "context"));
  await writeFile(join(root, "context/config.json"), "{}");
  await expect(
    assertContainedOrdinaryPath({
      baseDirectory: root,
      relativePath: "context/config.json",
      expected: "file",
    }),
  ).resolves.toBe(join(root, "context/config.json"));
  await expect(
    assertContainedOrdinaryPath({
      baseDirectory: root,
      relativePath: "../config.json",
      expected: "file",
    }),
  ).rejects.toThrow(/unsafe|escape/i);
});

it("rejects symlinks in the path", async () => {
  const root = await mkdtemp(join(tmpdir(), "uig-contained-"));
  roots.push(root);
  const outside = await mkdtemp(join(tmpdir(), "uig-outside-"));
  roots.push(outside);
  await symlink(outside, join(root, "context"));
  await expect(
    assertContainedOrdinaryPath({
      baseDirectory: root,
      relativePath: "context/config.json",
      expected: "file",
      allowMissingLeaf: true,
    }),
  ).rejects.toThrow(/ordinary|symbolic/i);
});
