import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createArtifactStore } from "@uig/design-context";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPixsoSnapshot } from "./fetch-pixso-snapshot.js";
import type { PixsoDslClient } from "./pixso-dsl-client.js";

describe("fetchPixsoSnapshot", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("retrieves, stores, and describes the exact Pixso DSL bytes", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        dsl: {
          converterVersion: "2.2.13",
          dslVersion: "2.1.15",
          pixTreeDslNodes: [],
          pixComponentTreeDslNodes: [],
          localStyleMap: {},
          variableMap: {},
          variableSetMap: {},
          sourceMapByUrl: {},
          specialNode: [],
          isContainFixed: false,
        },
      }),
    );
    const getNodeDsl = vi.fn<PixsoDslClient["getNodeDsl"]>(async () => bytes);
    const root = await mkdtemp(join(tmpdir(), "uig-pixso-"));
    temporaryRoots.push(root);

    const snapshot = await fetchPixsoSnapshot({
      url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314&page-id=1:2",
      client: { getNodeDsl },
      store: createArtifactStore(root),
      now: () => new Date("2026-07-26T10:30:00.000Z"),
    });

    expect(getNodeDsl).toHaveBeenCalledExactlyOnceWith({
      fileKey: "WSLukjrKancvZG0zbaMnyA",
      guid: "4:314",
    });
    expect(snapshot).toEqual({
      schema: "design-snapshot/v1",
      artifactId: expect.stringMatching(
        /^pixso_WSLukjrKancvZG0zbaMnyA_4_314_[a-f0-9]{12}$/,
      ),
      provider: "pixso",
      source: {
        documentId: "WSLukjrKancvZG0zbaMnyA",
        nodeId: "4:314",
        url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4%3A314",
      },
      retrievedAt: "2026-07-26T10:30:00.000Z",
      content: {
        format: "pixso-node-dsl",
        version: "2.1.15",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.byteLength,
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain(root);
    expect(JSON.stringify(snapshot)).not.toContain("access_token");
    expect(await createArtifactStore(root).read(snapshot.artifactId)).toEqual(
      bytes,
    );
  });

  it("rejects content without a DSL version before storing it", async () => {
    const root = await mkdtemp(join(tmpdir(), "uig-pixso-"));
    temporaryRoots.push(root);

    await expect(
      fetchPixsoSnapshot({
        url: "https://pixso.net/app/design/file?item-id=1:2",
        client: {
          getNodeDsl: async () =>
            new TextEncoder().encode('{"dsl":{"pixTreeDslNodes":[]}}'),
        },
        store: createArtifactStore(root),
        now: () => new Date(0),
      }),
    ).rejects.toMatchObject({
      code: "PIXSO_RESPONSE_INVALID",
    });
  });
});
