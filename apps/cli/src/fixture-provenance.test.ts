import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyReactFixtureProvenance } from "../../../scripts/verify-fixture-provenance.js";

describe("verifyReactFixtureProvenance", () => {
  it("accepts only an exact, duplicate-free inventory of fixture files", async () => {
    const root = await fixtureRoot();
    const file = await fixture(root, "modal/generated/Generated.tsx", "tsx");

    await expect(
      verifyReactFixtureProvenance(root, [file]),
    ).resolves.toBeUndefined();
  });

  it("rejects an unlisted fixture file", async () => {
    const root = await fixtureRoot();
    const file = await fixture(root, "modal/generated/Generated.tsx", "tsx");
    await fixture(root, "modal/generated/Generated.module.css", "css");

    await expect(verifyReactFixtureProvenance(root, [file])).rejects.toThrow(
      "does not exactly match",
    );
  });

  it("rejects duplicate provenance paths", async () => {
    const root = await fixtureRoot();
    const file = await fixture(root, "modal/generated/Generated.tsx", "tsx");

    await expect(
      verifyReactFixtureProvenance(root, [file, file]),
    ).rejects.toThrow("duplicate path");
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "uig-provenance-test-"));
  await writeFile(join(root, "README.md"), "provenance belongs here", "utf8");
  return root;
}

async function fixture(
  root: string,
  path: string,
  content: string,
): Promise<{ path: string; byteLength: number; sha256: string }> {
  const absolute = join(root, ...path.split("/"));
  await mkdir(join(absolute, ".."), { recursive: true });
  const bytes = Buffer.from(content);
  await writeFile(absolute, bytes);
  return {
    path,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
