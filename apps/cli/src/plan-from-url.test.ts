import minimalPixsoDsl from "../../../packages/design-normalizer/src/__fixtures__/minimal-pixso-dsl.json";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DesignIRSchema,
  DesignSnapshotSchema,
  DesignSummarySchema,
  GenerationRunSchema,
  ResolutionPlanSchema,
  UiManifestSchema,
  validateWithSchema,
} from "@uig/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { planFromUrl } from "./plan-from-url.js";

const sberPack = fileURLToPath(
  new URL("../../../design-system-packs/sber-space-ui", import.meta.url),
);

describe("planFromUrl", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("writes a complete inspectable run without leaking paths or secrets", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "uig-run-"));
    roots.push(workspaceDir);
    const tokenSentinel = "TOKEN_SENTINEL_MUST_NOT_APPEAR";
    const pixsoClient = {
      getNodeDsl: async () =>
        new TextEncoder().encode(JSON.stringify(minimalPixsoDsl)),
      token: tokenSentinel,
    };
    const run = await planFromUrl({
      url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314",
      designSystemPackPath: sberPack,
      workspaceDir,
      pixsoClient,
      now: () => new Date("2026-07-26T10:30:00.000Z"),
    });

    expect(run.runId).toBe("run_20260726T103000000Z_4-314");
    const runDir = join(workspaceDir, ".uig", "runs", run.runId);
    const files = {
      run: "run.json",
      snapshot: "snapshot.json",
      designIr: "design-ir.json",
      designSummary: "design-summary.json",
      uiManifest: "ui-manifest.json",
      resolutionPlan: "resolution-plan.sber-space-ui.json",
      diagnostics: "diagnostics.json",
    };
    const contents = Object.fromEntries(
      await Promise.all(
        Object.entries(files).map(async ([key, file]) => [
          key,
          await readFile(join(runDir, file), "utf8"),
        ]),
      ),
    );

    validateWithSchema(GenerationRunSchema, JSON.parse(contents.run!));
    validateWithSchema(DesignSnapshotSchema, JSON.parse(contents.snapshot!));
    validateWithSchema(DesignIRSchema, JSON.parse(contents.designIr!));
    validateWithSchema(
      DesignSummarySchema,
      JSON.parse(contents.designSummary!),
    );
    validateWithSchema(UiManifestSchema, JSON.parse(contents.uiManifest!));
    validateWithSchema(
      ResolutionPlanSchema,
      JSON.parse(contents.resolutionPlan!),
    );
    expect(Array.isArray(JSON.parse(contents.diagnostics!))).toBe(true);
    expect(Object.values(contents).join("\n")).not.toContain(workspaceDir);
    expect(Object.values(contents).join("\n")).not.toContain(tokenSentinel);
    expect(run.artifacts).toEqual({
      snapshot: "snapshot.json",
      designIr: "design-ir.json",
      designSummary: "design-summary.json",
      uiManifest: "ui-manifest.json",
      resolutionPlan: "resolution-plan.sber-space-ui.json",
      diagnostics: "diagnostics.json",
    });
  });
});
