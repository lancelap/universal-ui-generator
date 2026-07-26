import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDesignSystemPack } from "@uig/component-catalog";
import { resolveUiManifest } from "@uig/component-resolver";
import { stableStringify } from "@uig/contracts";
import { buildDesignSummary } from "@uig/design-context";
import { normalizePixsoDesign } from "@uig/design-normalizer";
import { buildUiManifest } from "@uig/semantic-planner";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureDir = join(repoRoot, "fixtures", "pixso", "modal-4-314");
const artifactId = "pixso_WSLukjrKancvZG0zbaMnyA_4_314_0d6c50995105";

describe("offline real-Pixso acceptance", () => {
  it("reproduces reviewed 4:314 artifacts through both design systems", async () => {
    const rawDsl = JSON.parse(
      await readFile(join(fixtureDir, "source.json"), "utf8"),
    );
    const [sber, mui] = await Promise.all([
      loadDesignSystemPack(
        join(repoRoot, "design-system-packs", "sber-space-ui"),
      ),
      loadDesignSystemPack(
        join(repoRoot, "design-system-packs", "material-ui"),
      ),
    ]);
    const designIr = normalizePixsoDesign({ artifactId, rawDsl });
    const designSummary = buildDesignSummary({ ir: designIr });
    const uiManifest = buildUiManifest({
      ir: designIr,
      exactMappings: [...sber.exactPixsoMappings],
    });
    const sberPlan = resolveUiManifest({
      manifest: uiManifest,
      designIr,
      pack: sber,
    });
    const muiPlan = resolveUiManifest({
      manifest: uiManifest,
      designIr,
      pack: mui,
    });

    await expectGolden("expected.design-ir.json", designIr);
    await expectGolden("expected.design-summary.json", designSummary);
    await expectGolden("expected.ui-manifest.json", uiManifest);
    await expectGolden("expected.sber-space-ui.resolution-plan.json", sberPlan);
    await expectGolden("expected.material-ui.resolution-plan.json", muiPlan);
    expect(
      Buffer.byteLength(stableStringify(designSummary)),
    ).toBeLessThanOrEqual(20_000);
    expect(stableStringify(muiPlan)).not.toContain("@sber-space-ui");
    expect(stableStringify(sberPlan)).not.toContain("@mui/material");
  });

  it.each([
    {
      fixture: "node-6-12547",
      artifactId: "pixso_WSLukjrKancvZG0zbaMnyA_6_12547_4a55447b5272",
      rootNodeId: "6:12547",
      rootName: "Modal",
      minimumNodeCount: 400,
    },
    {
      fixture: "node-70-118892",
      artifactId: "pixso_PqSywlhYgqSRDoWr78IrdA_70_118892_899812d8c628",
      rootNodeId: "70:118892",
      rootName: "Task",
      minimumNodeCount: 300,
    },
  ])(
    "normalizes the selected root in $fixture without network access",
    async ({ fixture, artifactId, rootNodeId, rootName, minimumNodeCount }) => {
      const rawDsl = JSON.parse(
        await readFile(
          join(repoRoot, "fixtures", "pixso", fixture, "source.json"),
          "utf8",
        ),
      );

      const designIr = normalizePixsoDesign({
        artifactId,
        rootNodeId,
        rawDsl,
      });
      const designSummary = buildDesignSummary({ ir: designIr });

      expect(designIr.rootNodeId).toBe(rootNodeId);
      expect(designIr.nodes[rootNodeId]).toMatchObject({
        name: rootName,
        type: "frame",
        visible: true,
      });
      expect(Object.keys(designIr.nodes).length).toBeGreaterThanOrEqual(
        minimumNodeCount,
      );
      expect(designIr.diagnostics).toEqual([]);
      expect(
        Buffer.byteLength(stableStringify(designSummary)),
      ).toBeLessThanOrEqual(20_000);
    },
  );
});

async function expectGolden(file: string, actual: unknown): Promise<void> {
  const expected = await readFile(join(fixtureDir, file), "utf8");
  expect(stableStringify(actual)).toBe(expected);
}
