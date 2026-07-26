import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ArtifactStoreError, createArtifactStore } from "./artifact-store.js";

describe("content-addressed artifact storage", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("deduplicates identical source bytes without exposing storage paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "uig-store-"));
    temporaryRoots.push(root);
    const store = createArtifactStore(root);
    const bytes = new TextEncoder().encode('{"dslVersion":"2.1.15"}');
    const input = {
      provider: "pixso" as const,
      documentId: "WSLukjrKancvZG0zbaMnyA",
      nodeId: "4:314",
      bytes,
    };

    const first = await store.put(input);
    const second = await store.put(input);

    expect(second).toEqual(first);
    expect(first.artifactId).toMatch(
      /^pixso_WSLukjrKancvZG0zbaMnyA_4_314_[a-f0-9]{12}$/,
    );
    expect(await store.read(first.artifactId)).toEqual(bytes);
    expect(await store.describe(first.artifactId)).toEqual({
      ...first,
      provider: "pixso",
      documentId: "WSLukjrKancvZG0zbaMnyA",
      nodeId: "4:314",
    });
    expect(await readdir(join(root, "cache", "sha256"))).toHaveLength(1);

    const metadataText = await readFile(
      join(root, "artifacts", `${first.artifactId}.json`),
      "utf8",
    );
    expect(metadataText).not.toContain(root);
    expect(JSON.stringify(first)).not.toContain(root);
    expect(JSON.parse(metadataText)).toMatchObject(first);
  });

  it("rejects an invalid artifact ID before attempting filesystem access", async () => {
    const root = await mkdtemp(join(tmpdir(), "uig-store-"));
    temporaryRoots.push(root);
    const store = createArtifactStore(root);

    await expect(store.read("../../etc/passwd")).rejects.toMatchObject({
      name: "ArtifactStoreError",
      code: "ARTIFACT_ID_INVALID",
    } satisfies Partial<ArtifactStoreError>);
  });
});
