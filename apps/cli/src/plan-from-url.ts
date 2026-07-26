import { join } from "node:path";

import { createArtifactStore } from "@uig/design-context";
import { fetchPixsoSnapshot, type PixsoDslClient } from "@uig/provider-pixso";

import { planFromSnapshot } from "./plan-from-snapshot.js";

export async function planFromUrl(input: {
  url: string;
  designSystemPackPath: string;
  workspaceDir: string;
  pixsoClient: PixsoDslClient;
  now: () => Date;
}) {
  const snapshot = await fetchPixsoSnapshot({
    url: input.url,
    client: input.pixsoClient,
    store: createArtifactStore(join(input.workspaceDir, ".uig")),
    now: input.now,
  });
  return planFromSnapshot({
    artifactId: snapshot.artifactId,
    designSystemPackPath: input.designSystemPackPath,
    workspaceDir: input.workspaceDir,
    now: input.now,
    snapshot,
    fetchCompleted: true,
  });
}
