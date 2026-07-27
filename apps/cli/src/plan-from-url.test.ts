import minimalPixsoDsl from "../../../packages/design-normalizer/src/__fixtures__/minimal-pixso-dsl.json";

import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DesignIRV2Schema,
  DesignSnapshotSchema,
  DesignSummarySchema,
  GenerationRunSchema,
  ResolutionPlanV2Schema,
  UiManifestV2Schema,
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
    validateWithSchema(DesignIRV2Schema, JSON.parse(contents.designIr!));
    validateWithSchema(
      DesignSummarySchema,
      JSON.parse(contents.designSummary!),
    );
    validateWithSchema(UiManifestV2Schema, JSON.parse(contents.uiManifest!));
    validateWithSchema(
      ResolutionPlanV2Schema,
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

  it("rejects a pre-existing workspace .uig symlink", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "uig-run-"));
    const outside = await mkdtemp(join(tmpdir(), "uig-outside-"));
    roots.push(workspaceDir, outside);
    await symlink(outside, join(workspaceDir, ".uig"));
    let fetched = false;

    await expect(
      planFromUrl({
        url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314",
        designSystemPackPath: sberPack,
        workspaceDir,
        pixsoClient: {
          getNodeDsl: async () => {
            fetched = true;
            return new Uint8Array();
          },
        },
        now: () => new Date("2026-07-26T10:30:00.000Z"),
      }),
    ).rejects.toThrow("Storage path must be an ordinary directory");
    expect(fetched).toBe(false);
  });

  it.each(["cache", "artifacts", "runs"])(
    "rejects a pre-existing .uig/%s symlink",
    async (directory) => {
      const workspaceDir = await mkdtemp(join(tmpdir(), "uig-run-"));
      const outside = await mkdtemp(join(tmpdir(), "uig-outside-"));
      roots.push(workspaceDir, outside);
      await mkdir(join(workspaceDir, ".uig"));
      await symlink(outside, join(workspaceDir, ".uig", directory));
      let fetched = false;

      await expect(
        planFromUrl({
          url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314",
          designSystemPackPath: sberPack,
          workspaceDir,
          pixsoClient: {
            getNodeDsl: async () => {
              fetched = true;
              return new Uint8Array();
            },
          },
          now: () => new Date("2026-07-26T10:30:00.000Z"),
        }),
      ).rejects.toThrow("Storage path must be an ordinary directory");
      expect(fetched).toBe(false);
    },
  );
});
