import minimalPixsoDsl from "../../../packages/design-normalizer/src/__fixtures__/minimal-pixso-dsl.json";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDesignSystemPackV2 } from "@uig/component-catalog";
import {
  DesignIRSchema,
  DesignSnapshotSchema,
  GenerationRunSchema,
  ResolutionPlanSchema,
  UiManifestSchema,
  stableStringify,
  validateWithSchema,
} from "@uig/contracts";
import { createArtifactStore, sha256 } from "@uig/design-context";
import { afterEach, describe, expect, it } from "vitest";

import { planFromSnapshot } from "./plan-from-snapshot.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const muiPackPath = join(repoRoot, "design-system-packs", "material-ui");
const historicalFixtureRoot = join(
  repoRoot,
  "fixtures",
  "pixso",
  "modal-4-314",
);

describe("generation-ready planning artifacts", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("writes linked v2 artifacts while retaining v1 snapshot and run indexes", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "uig-plan-v2-"));
    roots.push(workspaceDir);
    const stored = await createArtifactStore(join(workspaceDir, ".uig")).put({
      provider: "pixso",
      documentId: "WSLukjrKancvZG0zbaMnyA",
      nodeId: "4:314",
      bytes: new TextEncoder().encode(JSON.stringify(minimalPixsoDsl)),
    });
    const pack = await loadDesignSystemPackV2(muiPackPath);

    const run = await planFromSnapshot({
      artifactId: stored.artifactId,
      designSystemPackPath: muiPackPath,
      workspaceDir,
      now: () => new Date("2026-07-26T10:30:00.000Z"),
    });
    const runDir = join(workspaceDir, ".uig", "runs", run.runId);
    const [snapshot, runIndex, designIr, uiManifest, resolutionPlan] =
      await Promise.all([
        readJson(join(runDir, "snapshot.json")),
        readJson(join(runDir, "run.json")),
        readJson(join(runDir, "design-ir.json")),
        readJson(join(runDir, "ui-manifest.json")),
        readJson(join(runDir, "resolution-plan.material-ui.json")),
      ]);

    expect(snapshot.schema).toBe("design-snapshot/v1");
    expect(runIndex.schema).toBe("generation-run/v1");
    validateWithSchema(DesignSnapshotSchema, snapshot);
    validateWithSchema(GenerationRunSchema, runIndex);
    expect(designIr.schema).toBe("design-ir/v2");
    expect(uiManifest.schema).toBe("ui-manifest/v2");
    expect(resolutionPlan.schema).toBe("resolution-plan/v2");
    expect(resolutionPlan.source.designIr.sha256).toBe(
      sha256(stableStringify(designIr)),
    );
    expect(resolutionPlan.source.uiManifest.sha256).toBe(
      sha256(stableStringify(uiManifest)),
    );
    expect(resolutionPlan.target.packSha256).toBe(pack.sha256);
  });

  it("keeps the historical Slice 1 fixtures readable by v1 validators", async () => {
    const [designIr, uiManifest, resolutionPlan] = await Promise.all([
      readJson(join(historicalFixtureRoot, "expected.design-ir.json")),
      readJson(join(historicalFixtureRoot, "expected.ui-manifest.json")),
      readJson(
        join(
          historicalFixtureRoot,
          "expected.material-ui.resolution-plan.json",
        ),
      ),
    ]);

    expect(validateWithSchema(DesignIRSchema, designIr).schema).toBe(
      "design-ir/v1",
    );
    expect(validateWithSchema(UiManifestSchema, uiManifest).schema).toBe(
      "ui-manifest/v1",
    );
    expect(
      validateWithSchema(ResolutionPlanSchema, resolutionPlan).schema,
    ).toBe("resolution-plan/v1");
  });
});

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}
