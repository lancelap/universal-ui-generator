import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadDesignSystemPack,
  loadDesignSystemPackV2,
} from "@uig/component-catalog";
import {
  resolveUiManifest,
  resolveUiManifestV2,
} from "@uig/component-resolver";
import { stableStringify } from "@uig/contracts";
import { buildDesignSummary } from "@uig/design-context";
import {
  normalizePixsoDesign,
  normalizePixsoDesignV2WithProvenance,
} from "@uig/design-normalizer";
import { buildUiManifest, buildUiManifestV2 } from "@uig/semantic-planner";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureDir = join(repoRoot, "fixtures", "pixso", "modal-4-314");
const generatedFixtureDir = join(
  repoRoot,
  "fixtures",
  "react-generation",
  "pixso-4-314",
  "sber-space-ui",
  "generated",
);
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

    const generationReport = JSON.parse(
      await readFile(
        join(generatedFixtureDir, "generation-report.json"),
        "utf8",
      ),
    );
    expect(generationReport).toMatchObject({
      schema: "react-generation-report/v2",
      status: "generated",
      validation: { targetTypecheck: "not-run" },
      renderOnlyProps: [
        {
          manifestNodeId: "ui_combobox_4-316",
          componentId: "base.Autocomplete",
          propNames: ["mode", "onChange", "options", "value"],
        },
      ],
    });
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

  it("materializes keyless defaults for Pixso 70:118892 in V2", async () => {
    const rawDsl = JSON.parse(
      await readFile(
        join(repoRoot, "fixtures", "pixso", "node-70-118892", "source.json"),
        "utf8",
      ),
    );

    const result = normalizePixsoDesignV2WithProvenance({
      artifactId: "pixso_PqSywlhYgqSRDoWr78IrdA_70_118892_899812d8c628",
      rootNodeId: "70:118892",
      rawDsl,
    });
    const textOrigin = result.provenance.values.find(
      (origin) =>
        origin.sourceNodeId === "4:63130" &&
        origin.targetPath === "/text/value",
    );
    const materializedText = textOrigin
      ? result.designIr.nodes[textOrigin.targetNodeId]
      : undefined;

    expect(result.designIr.rootNodeId).toBe("70:118892");
    expect(materializedText).toBeDefined();
    expect(materializedText).toMatchObject({
      text: {
        value:
          "Сообщите сотруднику бизнеса (SecurityDesk) о невозможности дальнейшей обработки сделки\nОна будет остановлена",
      },
      geometry: {
        x: 0,
        y: 20,
        width: 561,
        height: 32,
      },
    });

    expect(textOrigin).toMatchObject({
      kind: "instance-override",
      sourceNodeId: "4:63130",
      sourcePropertyPath: "27:101325/4:63130",
      componentDefinitionNodeId: "31:100831",
    });
    expect(textOrigin).not.toHaveProperty("componentKey");

    for (const targetPath of [
      "/geometry/x",
      "/geometry/y",
      "/geometry/width",
      "/geometry/height",
    ]) {
      const geometryOrigin = result.provenance.values.find(
        (origin) =>
          origin.targetNodeId === materializedText!.id &&
          origin.targetPath === targetPath,
      );
      expect(geometryOrigin).toMatchObject({
        kind: "component-default",
        sourceNodeId: "4:63130",
        sourcePropertyPath: "27:101325/4:63130",
        componentDefinitionNodeId: "31:100831",
      });
      expect(geometryOrigin).not.toHaveProperty("componentKey");
    }
  });

  it("plans the real 70:118899 choice panel offline without low-confidence blockers", async () => {
    const rawDsl = JSON.parse(
      await readFile(
        join(repoRoot, "fixtures", "pixso", "node-70-118899", "source.json"),
        "utf8",
      ),
    );
    const pack = await loadDesignSystemPackV2(
      join(repoRoot, "design-system-packs", "sber-space-ui"),
    );
    const normalized = normalizePixsoDesignV2WithProvenance({
      artifactId: "pixso_PqSywlhYgqSRDoWr78IrdA_70_118899_1ff9d4c80454",
      rootNodeId: "70:118899",
      rawDsl,
    });
    const manifest = buildUiManifestV2({
      ir: normalized.designIr,
      provenance: normalized.provenance,
      exactMappings: [...pack.exactPixsoMappings],
    });
    const plan = resolveUiManifestV2({
      manifest,
      designIr: normalized.designIr,
      pack,
    });

    expect(manifest.root).toMatchObject({
      role: "choicePanel",
      children: [],
      content: {
        sections: [{ options: [{}, {}, {}] }, { options: [{}, {}] }],
      },
    });
    expect(plan.summary).toEqual({
      reuse: 0,
      compose: 1,
      fallback: 0,
      blocked: 0,
    });
    expect(
      [...manifest.diagnostics, ...plan.diagnostics].map(
        (diagnostic) => diagnostic.code,
      ),
    ).not.toContain("SEMANTIC_CONFIDENCE_TOO_LOW");
    expect(
      manifest.diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === "DUPLICATE_MATERIALIZED_NODE_COLLAPSED",
      ),
    ).toHaveLength(1);
  });
});

async function expectGolden(file: string, actual: unknown): Promise<void> {
  const expected = await readFile(join(fixtureDir, file), "utf8");
  expect(stableStringify(actual)).toBe(expected);
}
