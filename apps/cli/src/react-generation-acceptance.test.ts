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
import { normalizePixsoDesignV2WithProvenance } from "@uig/design-normalizer";
import { generateReactBundle } from "@uig/generator-react";
import { buildUiManifestV2 } from "@uig/semantic-planner";
import { describe, expect, it } from "vitest";

import {
  collectExternalInterfacePropNames,
  generateReactAcceptanceCandidates,
} from "../../../scripts/generate-react-acceptance-candidates.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const neutralRoot = join(repoRoot, "fixtures", "react-generation", "modal");
const realRoot = join(
  repoRoot,
  "fixtures",
  "react-generation",
  "pixso-4-314",
  "sber-space-ui",
);
const choiceRoot = join(
  repoRoot,
  "fixtures",
  "react-generation",
  "pixso-70-118899",
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

  it("structurally reports required and optional external interface props", () => {
    expect(
      collectExternalInterfacePropNames(`
        export interface GeneratedExampleProps {
          title: string;
          disabled?: boolean;
          onSubmit?: () => void;
        }
      `),
    ).toEqual(["disabled", "onSubmit", "title"]);
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
        return { packId, pack, bundle: first, tsx: source(first, ".tsx") };
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
    expect(sber.tsx).not.toMatch(/\b(FormControl|FormLabel)\b/);
    expect(sber.pack.componentsById.has("base.FormControl")).toBe(true);
    expect(sber.pack.componentsById.has("base.FormLabel")).toBe(true);
    expect(sber.tsx).toContain(
      '<Field placeholder="Введите название" value=""/>',
    );
    const textInputResolution = (
      await readContract<ResolutionPlanV2>(
        join(neutralRoot, "sber-space-ui", "resolution-plan.json"),
        ResolutionPlanV2Schema,
      )
    ).nodes.find((node) => node.manifestNodeId === "ui_text_input");
    expect(
      textInputResolution && "binding" in textInputResolution
        ? [textInputResolution.binding.componentId]
        : [],
    ).toEqual(["base.Field"]);
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

  it.each([
    ["sber-space-ui", "Field/Text", "placeholder", "Field"],
    ["material-ui", "MuiTextField", "label", "TextField"],
  ] as const)(
    "generates an ordinary %s text input with only design-backed placeholder text",
    async (packId, componentKey, textProp, exportName) => {
      const pack = await loadDesignSystemPackV2(
        join(repoRoot, "design-system-packs", packId),
      );
      const withPlaceholderNormalized = normalizePixsoDesignV2WithProvenance({
        artifactId: `pixso_${packId}_text_input`,
        rootNodeId: "10:1",
        rawDsl: pixsoTextInput(componentKey, "Введите название"),
      });
      const withPlaceholder = withPlaceholderNormalized.designIr;
      const uiManifest = buildUiManifestV2({
        ir: withPlaceholder,
        provenance: withPlaceholderNormalized.provenance,
        exactMappings: [...pack.exactPixsoMappings],
      });
      const plan = resolveUiManifestV2({
        manifest: uiManifest,
        designIr: withPlaceholder,
        pack,
      });
      const generated = generateReactBundle({
        sourceRunId: `run_${packId}_text_input`,
        designIr: withPlaceholder,
        uiManifest,
        resolutionPlan: plan,
        pack,
      });

      expect(uiManifest.root).toMatchObject({
        role: "textInput",
        content: { label: "Введите название" },
        sourceNodeIds: ["10:1", "10:2"],
        evidence: expect.arrayContaining([
          { kind: "direct-text-source-node", value: "10:2" },
          {
            kind: "direct-text-selection-rule",
            value: "single-visible-direct-text",
          },
        ]),
      });
      const tsx = source(generated, ".tsx");
      expect(tsx).toContain(`<${exportName}`);
      expect(tsx).toContain(`${textProp}="Введите название"`);
      expect(tsx).toContain('value=""');
      expect(generated.report.renderOnlyProps).toEqual([
        {
          manifestNodeId: "ui_textInput_10-1",
          componentId:
            packId === "sber-space-ui" ? "base.Field" : "mui.TextField",
          propNames: ["value"],
        },
      ]);
      expect(tsx).not.toMatch(
        /\b(useState|useEffect|options|fetch|axios|react-hook-form)\b/,
      );

      const withoutPlaceholderNormalized = normalizePixsoDesignV2WithProvenance(
        {
          artifactId: `pixso_${packId}_empty_text_input`,
          rootNodeId: "10:1",
          rawDsl: pixsoTextInput(componentKey),
        },
      );
      const withoutPlaceholder = withoutPlaceholderNormalized.designIr;
      const emptyManifest = buildUiManifestV2({
        ir: withoutPlaceholder,
        provenance: withoutPlaceholderNormalized.provenance,
        exactMappings: [...pack.exactPixsoMappings],
      });
      const emptyPlan = resolveUiManifestV2({
        manifest: emptyManifest,
        designIr: withoutPlaceholder,
        pack,
      });
      const emptyGenerated = generateReactBundle({
        sourceRunId: `run_${packId}_empty_text_input`,
        designIr: withoutPlaceholder,
        uiManifest: emptyManifest,
        resolutionPlan: emptyPlan,
        pack,
      });
      const emptyTsx = source(emptyGenerated, ".tsx");
      expect(emptyManifest.root.content).toBeUndefined();
      expect(emptyTsx).toContain('value=""');
      expect(emptyTsx).not.toContain(`${textProp}=`);
    },
  );

  it("generates the real 4:314 Sber modal with design-backed footer actions", async () => {
    const rawDsl = JSON.parse(
      await readFile(
        join(repoRoot, "fixtures", "pixso", "modal-4-314", "source.json"),
        "utf8",
      ),
    );
    const pack = await loadDesignSystemPackV2(
      join(repoRoot, "design-system-packs", "sber-space-ui"),
    );
    const normalized = normalizePixsoDesignV2WithProvenance({
      artifactId: "pixso_WSLukjrKancvZG0zbaMnyA_4_314_0d6c50995105",
      rootNodeId: "4:314",
      rawDsl,
    });
    const designIr = normalized.designIr;
    const uiManifest = buildUiManifestV2({
      ir: designIr,
      provenance: normalized.provenance,
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
    expect(normalized.provenance.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetPath: "/text/value",
          kind: "component-default",
          sourceNodeId: "4:557",
        }),
        expect.objectContaining({
          targetPath: "/text/value",
          kind: "instance-override",
          sourceNodeId: "4:599",
        }),
      ]),
    );
    expect(
      flattenUiNodes(uiManifest.root).find(
        (node) => node.role === "secondaryAction",
      ),
    ).toMatchObject({
      content: { label: "Отмена" },
    });
    expect(
      flattenUiNodes(uiManifest.root).find(
        (node) => node.role === "primaryAction",
      ),
    ).toMatchObject({
      content: { label: "Подтвердить и закончить" },
    });
    expect(generated.report.renderOnlyProps).toEqual([
      {
        manifestNodeId: "ui_combobox_4-316",
        componentId: "base.Autocomplete",
        propNames: ["mode", "onChange", "options", "value"],
      },
    ]);
    expect(
      generated.report.diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === "GENERATION_RENDER_ONLY_CHILDREN_MISSING" &&
          diagnostic.evidence?.manifestNodeId === "ui_actionGroup_4-317",
      ),
    ).toEqual([]);

    const tsx = source(generated, ".tsx");
    const readableTsx = decodeUnicodeEscapes(tsx);
    expect(tsx).toContain(
      'import { Autocomplete } from "@sber-space-ui/autocomplete";',
    );
    expect(tsx).toContain("options={[]}");
    expect(tsx).toContain("onChange={() => undefined}");
    expect(tsx).toContain('import { Button } from "@sber-space-ui/button";');
    expect(readableTsx).toContain("Отмена");
    expect(readableTsx).toContain("Подтвердить и закончить");
    expect(tsx.match(/<Button\b/g)).toHaveLength(2);
    await expectAcceptedBundle(join(realRoot, "generated"), generated);
  });

  it("generates the reviewed real 70:118899 Sber choice panel", async () => {
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
    const uiManifest = buildUiManifestV2({
      ir: normalized.designIr,
      provenance: normalized.provenance,
      exactMappings: [...pack.exactPixsoMappings],
    });
    const plan = resolveUiManifestV2({
      manifest: uiManifest,
      designIr: normalized.designIr,
      pack,
    });
    const generated = generateReactBundle({
      sourceRunId: "run_acceptance_pixso_70_118899",
      designIr: normalized.designIr,
      uiManifest,
      resolutionPlan: plan,
      pack,
    });

    expect(uiManifest.root).toMatchObject({
      role: "choicePanel",
      content: {
        sections: [{ options: [{}, {}, {}] }, { options: [{}, {}] }],
      },
      children: [],
    });
    expect(plan.summary).toEqual({
      reuse: 0,
      compose: 1,
      fallback: 0,
      blocked: 0,
    });
    expect(generated.report).toMatchObject({
      status: "generated",
      componentName: "GeneratedChoicePanel",
      statistics: { manifestNodes: 1, fallbackComponents: 0 },
    });
    expect(generated.report.diagnostics).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ blocking: true })]),
    );
    const tsx = source(generated, ".tsx");
    const readableTsx = decodeUnicodeEscapes(tsx);
    expect(tsx).toContain(
      'import { RadioButton, RadioGroup } from "@sber-space-ui/radio";',
    );
    expect(tsx).toContain(
      'import { FormDescription } from "@sber-space-ui/form-control";',
    );
    expect(tsx).toContain(
      'import { DocumentText } from "@sber-space-ui/icons/24/Stroke/File_And_Folder";',
    );
    expect(tsx).toContain(
      'import { ExclamationMarkInfo } from "@sber-space-ui/icons/24/Stroke/UserInterface";',
    );
    expect(tsx.match(/<RadioGroup\b/g)).toHaveLength(1);
    expect(tsx.match(/<RadioButton\b/g)).toHaveLength(5);
    expect(tsx.match(/className=\{styles\["choiceSection"\]\}/g)).toHaveLength(
      2,
    );
    expect(readableTsx.indexOf("Переформормировать запрос")).toBeLessThan(
      readableTsx.indexOf("Сделка требует корректировок:"),
    );
    expect(tsx).not.toMatch(/useState|<input\b|type="radio"|Tooltip/);
    expect(source(generated, ".module.css")).toContain(
      "border: 1px solid rgba(31, 20, 51, 0.12);",
    );

    const acceptedPlan = await readContract<ResolutionPlanV2>(
      join(choiceRoot, "resolution-plan.json"),
      ResolutionPlanV2Schema,
    );
    expect(stableStringify(plan)).toBe(stableStringify(acceptedPlan));
    await expectAcceptedBundle(join(choiceRoot, "generated"), generated);
  });
});

function decodeUnicodeEscapes(value: string): string {
  return value.replace(/\\u([\dA-F]{4})/giu, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
}

function pixsoTextInput(componentKey: string, placeholder?: string): unknown {
  return {
    dsl: {
      dslVersion: "2.1.15",
      converterVersion: "2.2.13",
      pixTreeDslNodes: [
        {
          guid: "10:1",
          type: "INSTANCE",
          name: "Text input",
          visible: true,
          left: 0,
          top: 0,
          width: 320,
          height: 40,
          componentKey,
          childNode: placeholder
            ? [
                {
                  guid: "10:2",
                  type: "TEXT",
                  name: "Placeholder",
                  visible: true,
                  left: 12,
                  top: 10,
                  width: 200,
                  height: 20,
                  nodeText: placeholder,
                },
              ]
            : [],
        },
      ],
      pixComponentTreeDslNodes: [],
      localStyleMap: {},
      variableMap: {},
      variableSetMap: {},
    },
  };
}

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

function flattenUiNodes(root: UiManifestV2["root"]): UiManifestV2["root"][] {
  return [root, ...root.children.flatMap(flattenUiNodes)];
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
