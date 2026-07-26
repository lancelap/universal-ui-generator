import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDesignSystemPackV2 } from "@uig/component-catalog";
import { resolveUiManifestV2 } from "@uig/component-resolver";
import {
  type DesignIRV2,
  type ReactGenerationBundleV2,
  type ResolutionPlanV2,
  type UiManifestV2,
  DesignIRV2Schema,
  ResolutionPlanV2Schema,
  UiManifestV2Schema,
  stableStringify,
  validateWithSchema,
} from "@uig/contracts";
import { normalizePixsoDesignV2 } from "@uig/design-normalizer";
import { generateReactBundle } from "@uig/generator-react";
import { buildUiManifestV2 } from "@uig/semantic-planner";
import { describe, expect, it } from "vitest";

import { generateReactAcceptanceCandidates } from "../../../scripts/generate-react-acceptance-candidates.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const neutralRoot = join(repoRoot, "fixtures", "react-generation", "modal");
const realRoot = join(
  repoRoot,
  "fixtures",
  "react-generation",
  "pixso-4-314",
  "sber-space-ui",
);
const decoder = new TextDecoder();

describe("reviewed React generation acceptance", () => {
  it("refuses to write unreviewed candidates into accepted fixtures", async () => {
    await expect(
      generateReactAcceptanceCandidates({
        destination: join(repoRoot, "fixtures", "react-generation"),
      }),
    ).rejects.toThrow("outside fixtures");
  });

  it("generates one neutral modal deterministically through both packs", async () => {
    const manifestPath = join(neutralRoot, "source.ui-manifest.json");
    const manifestBytes = await readFile(manifestPath);
    const designIr = await readContract<DesignIRV2>(
      join(neutralRoot, "source.design-ir.json"),
      DesignIRV2Schema,
    );
    const uiManifest = await readContract<UiManifestV2>(
      manifestPath,
      UiManifestV2Schema,
    );

    const results = await Promise.all(
      ["sber-space-ui", "material-ui"].map(async (packId) => {
        const pack = await loadDesignSystemPackV2(
          join(repoRoot, "design-system-packs", packId),
        );
        const plan = resolveUiManifestV2({
          manifest: uiManifest,
          designIr,
          pack,
        });
        const acceptedPlan = await readContract<ResolutionPlanV2>(
          join(neutralRoot, packId, "resolution-plan.json"),
          ResolutionPlanV2Schema,
        );
        expect(stableStringify(plan)).toBe(stableStringify(acceptedPlan));

        const first = generateReactBundle({
          sourceRunId: "run_acceptance_neutral_modal",
          designIr,
          uiManifest,
          resolutionPlan: plan,
          pack,
        });
        const second = generateReactBundle({
          sourceRunId: "run_acceptance_neutral_modal",
          designIr,
          uiManifest,
          resolutionPlan: plan,
          pack,
        });
        expect(bundleMap(first)).toEqual(bundleMap(second));
        await expectAcceptedBundle(
          join(neutralRoot, packId, "generated"),
          first,
        );
        return { packId, bundle: first, tsx: source(first, ".tsx") };
      }),
    );

    expect(await readFile(manifestPath)).toEqual(manifestBytes);
    const sber = results.find((result) => result.packId === "sber-space-ui")!;
    const mui = results.find((result) => result.packId === "material-ui")!;
    expect(externalProps(sber.tsx)).toEqual(externalProps(mui.tsx));
    expect(externalProps(sber.tsx)).toEqual([
      "onCancel?: () => void;",
      "onSubmit?: () => void;",
    ]);
    expect(importPackages(sber.tsx)).not.toContain("@mui/material");
    expect(importPackages(mui.tsx)).not.toContainEqual(
      expect.stringContaining("@sber-space-ui/"),
    );
    expect(sber.tsx).not.toMatch(/\b(FieldBefore|FieldAfter)\b/);
    expect(sber.bundle.report.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: "GENERATION_RENDER_ONLY_CHILDREN_MISSING",
        evidence: expect.objectContaining({ manifestNodeId: "ui_text_input" }),
      }),
    );

    for (const result of results) {
      const allSource = [...bundleMap(result.bundle).values()].join("\n");
      expect(allSource).not.toMatch(
        /\b(useState|useEffect|fetch|axios|mutation|queryClient|react-hook-form)\b/,
      );
      expect(source(result.bundle, ".module.css")).not.toContain("!important");
      expect(source(result.bundle, ".module.css")).not.toMatch(
        /(^|\n)\s*[.#][^{\n]*\s+[.#][^{\n]*\{/,
      );
    }
  });

  it("generates the real 4:314 Sber modal with disclosed render-only gaps", async () => {
    const rawDsl = JSON.parse(
      await readFile(
        join(repoRoot, "fixtures", "pixso", "modal-4-314", "source.json"),
        "utf8",
      ),
    );
    const pack = await loadDesignSystemPackV2(
      join(repoRoot, "design-system-packs", "sber-space-ui"),
    );
    const designIr = normalizePixsoDesignV2({
      artifactId: "pixso_WSLukjrKancvZG0zbaMnyA_4_314_0d6c50995105",
      rootNodeId: "4:314",
      rawDsl,
    });
    const uiManifest = buildUiManifestV2({
      ir: designIr,
      exactMappings: [...pack.exactPixsoMappings],
    });
    const plan = resolveUiManifestV2({
      manifest: uiManifest,
      designIr,
      pack,
    });
    const generated = generateReactBundle({
      sourceRunId: "run_acceptance_pixso_4_314",
      designIr,
      uiManifest,
      resolutionPlan: plan,
      pack,
    });

    expect(plan.summary.blocked).toBe(0);
    expect(generated.report.renderOnlyProps).toEqual([
      {
        manifestNodeId: "ui_combobox_4-316",
        componentId: "base.Autocomplete",
        propNames: ["mode", "onChange", "options", "value"],
      },
    ]);
    expect(generated.report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "GENERATION_RENDER_ONLY_CHILDREN_MISSING",
        blocking: false,
        evidence: {
          manifestNodeId: "ui_actionGroup_4-317",
          semanticRole: "actionGroup",
        },
      }),
    );

    const tsx = source(generated, ".tsx");
    expect(tsx).toContain(
      'import { Autocomplete } from "@sber-space-ui/autocomplete";',
    );
    expect(tsx).toContain("options={[]}");
    expect(tsx).toContain("onChange={() => undefined}");
    expect(tsx).not.toMatch(/\bButton\b/);
    await expectAcceptedBundle(join(realRoot, "generated"), generated);
  });
});

async function readContract<T>(
  path: string,
  schema: Parameters<typeof validateWithSchema>[0],
): Promise<T> {
  return validateWithSchema(
    schema,
    JSON.parse(await readFile(path, "utf8")),
  ) as T;
}

function source(bundle: ReactGenerationBundleV2, suffix: string): string {
  const file = bundle.files.find(
    (candidate) =>
      candidate.path.startsWith("Generated") && candidate.path.endsWith(suffix),
  );
  if (!file) {
    throw new Error(`Generated bundle has no root ${suffix} file`);
  }
  return decoder.decode(file.bytes);
}

function importPackages(tsx: string): string[] {
  return [...tsx.matchAll(/from "([^"]+)";/g)]
    .map((match) => match[1]!)
    .filter((value) => !value.startsWith("."))
    .sort();
}

function externalProps(tsx: string): string[] {
  const body = tsx.match(
    /export interface GeneratedModalProps \{\n([\s\S]*?)\n\}/,
  )?.[1];
  return (body ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function bundleMap(bundle: ReactGenerationBundleV2): Map<string, string> {
  return new Map([
    ...bundle.files.map(
      (file) => [file.path, decoder.decode(file.bytes)] as const,
    ),
    ["generation-report.json", stableStringify(bundle.report)],
  ]);
}

async function expectAcceptedBundle(
  directory: string,
  bundle: ReactGenerationBundleV2,
): Promise<void> {
  const expected = new Map<string, string>();
  await collectFiles(directory, directory, expected);
  expect(bundleMap(bundle)).toEqual(expected);
}

async function collectFiles(
  root: string,
  directory: string,
  files: Map<string, string>,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, path, files);
    } else {
      files.set(
        path
          .slice(root.length + 1)
          .split("\\")
          .join("/"),
        await readFile(path, "utf8"),
      );
    }
  }
}
