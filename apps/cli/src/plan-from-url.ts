import { join } from "node:path";

import {
  createArtifactStore,
  ensureContainedDirectoryTree,
} from "@uig/design-context";
import { fetchPixsoSnapshot, type PixsoDslClient } from "@uig/provider-pixso";

import { planFromSnapshot } from "./plan-from-snapshot.js";

export async function planFromUrl(input: {
  url: string;
  designSystemPackPath: string;
  workspaceDir: string;
  pixsoClient: PixsoDslClient;
  now: () => Date;
}) {
  await ensureContainedDirectoryTree(input.workspaceDir, [
    ".uig",
    join(".uig", "cache"),
    join(".uig", "cache", "sha256"),
    join(".uig", "artifacts"),
    join(".uig", "runs"),
  ]);
  const snapshot = await fetchPixsoSnapshot({
    url: input.url,
    client: input.pixsoClient,
    store: createArtifactStore(join(input.workspaceDir, ".uig")),
    now: input.now,
  });
  await ensureContainedDirectoryTree(input.workspaceDir, [
    ".uig",
    join(".uig", "cache"),
    join(".uig", "cache", "sha256"),
    join(".uig", "artifacts"),
    join(".uig", "runs"),
  ]);
  const run = await planFromSnapshot({
    artifactId: snapshot.artifactId,
    designSystemPackPath: input.designSystemPackPath,
    workspaceDir: input.workspaceDir,
    now: input.now,
    snapshot,
    fetchCompleted: true,
  });
  await ensureContainedDirectoryTree(input.workspaceDir, [
    ".uig",
    join(".uig", "cache"),
    join(".uig", "cache", "sha256"),
    join(".uig", "artifacts"),
    join(".uig", "runs"),
    join(".uig", "runs", run.runId),
  ]);
  return run;
}
