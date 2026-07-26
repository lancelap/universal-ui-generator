import { fileURLToPath } from "node:url";

import { loadDesignSystemPackV2 } from "@uig/component-catalog";
import {
  type DesignIRV2,
  type ResolutionPlanV2,
  stableStringify,
  type UiManifestV2,
} from "@uig/contracts";
import { sha256 } from "@uig/design-context";
import { beforeAll, describe, expect, it } from "vitest";

import type { ReactGenerationInput } from "./generation-model.js";
import { generateReactBundle } from "./generate-react-bundle.js";

const materialUiPack = fileURLToPath(
  new URL("../../../design-system-packs/material-ui", import.meta.url),
);

describe("generateReactBundle", () => {
  let input: ReactGenerationInput;

  beforeAll(async () => {
    input = await fixture();
  });

  it("emits a deterministic, integrity-checked v2 source bundle", () => {
    const withRenderOnlyProps = withStackStaticProps(input);
    withRenderOnlyProps.resolutionPlan = {
      ...withRenderOnlyProps.resolutionPlan,
      diagnostics: [
        {
          severity: "warning",
          blocking: false,
          stage: "component-resolution",
          code: "COMPONENT_RESOLUTION_WARNING",
          message: "A non-blocking resolution warning",
          evidence: { manifestNodeId: "ui_actions" },
        },
      ],
    };
    const first = generateReactBundle(withRenderOnlyProps);
    const second = generateReactBundle(withRenderOnlyProps);

    expect(first.schema).toBe("react-generation-bundle/v2");
    expect(first.status).toBe("generated");
    expect(first.files.map((file) => file.path)).toEqual([
      "GeneratedModal.module.css",
      "GeneratedModal.tsx",
    ]);
    expect(first.report).toMatchObject({
      schema: "react-generation-report/v2",
      status: "generated",
      componentName: "GeneratedModal",
      validation: { targetTypecheck: "not-run" },
      renderOnlyProps: [
        {
          manifestNodeId: "ui_actions",
          componentId: "mui.Stack",
          propNames: ["alpha", "zeta"],
        },
      ],
    });
    expect(first.report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "GENERATION_RENDER_ONLY_CHILDREN_MISSING",
        severity: "warning",
      }),
    );
    expect(
      first.report.diagnostics.map((diagnostic) => diagnostic.code),
    ).toEqual([
      "COMPONENT_RESOLUTION_WARNING",
      "GENERATION_RENDER_ONLY_CHILDREN_MISSING",
    ]);
    expect(first.report.files.map((file) => file.path)).toEqual(
      first.files.map((file) => file.path),
    );
    expect(
      first.files.some((file) => file.path === "generation-report.json"),
    ).toBe(false);
    for (const file of first.files) {
      expect(file.byteLength).toBe(file.bytes.byteLength);
      expect(file.sha256).toBe(sha256(file.bytes));
    }
    expect(stableStringify(first.report)).toBe(stableStringify(second.report));
    expect(
      first.files.map((file) => ({
        ...file,
        bytes: [...file.bytes],
      })),
    ).toEqual(
      second.files.map((file) => ({
        ...file,
        bytes: [...file.bytes],
      })),
    );
  });

  it("keeps blocked output report-only", () => {
    const blocked = {
      ...input,
      resolutionPlan: structuredClone(input.resolutionPlan),
    };
    blocked.resolutionPlan.nodes[0] = {
      ...resolutionBase(blocked.resolutionPlan.nodes[0]!),
      decision: "blocked",
      diagnosticCodes: ["COMPONENT_UNRESOLVED"],
    };
    blocked.resolutionPlan.summary = {
      reuse: 0,
      compose: 0,
      fallback: 0,
      blocked: 1,
    };

    const result = generateReactBundle(blocked);

    expect(result).toMatchObject({
      schema: "react-generation-bundle/v2",
      status: "blocked",
      files: [],
      report: {
        schema: "react-generation-report/v2",
        status: "blocked",
        files: [],
        validation: { syntax: "not-run", targetTypecheck: "not-run" },
      },
    });
  });

  it("emits linked fallback TSX and CSS-module artifacts", () => {
    const fallback = {
      ...input,
      resolutionPlan: structuredClone(input.resolutionPlan),
    };
    fallback.resolutionPlan.nodes[0] = {
      ...resolutionBase(fallback.resolutionPlan.nodes[0]!),
      decision: "fallback",
      localComponentName: "generated warning",
      styleStrategy: "css-module",
    };
    fallback.resolutionPlan.summary = {
      reuse: 0,
      compose: 0,
      fallback: 1,
      blocked: 0,
    };

    const result = generateReactBundle(fallback);
    const rootTsx = new TextDecoder().decode(
      result.files.find((file) => file.path === "GeneratedModal.tsx")!.bytes,
    );
    const fallbackTsx = new TextDecoder().decode(
      result.files.find(
        (file) => file.path === "fallbacks/GeneratedWarning.tsx",
      )!.bytes,
    );
    const fallbackCss = new TextDecoder().decode(
      result.files.find(
        (file) => file.path === "fallbacks/GeneratedWarning.module.css",
      )!.bytes,
    );

    expect(result.files.map((file) => file.path)).toEqual([
      "GeneratedModal.module.css",
      "GeneratedModal.tsx",
      "fallbacks/GeneratedWarning.module.css",
      "fallbacks/GeneratedWarning.tsx",
    ]);
    expect(rootTsx).toContain(
      'import { GeneratedWarning } from "./fallbacks/GeneratedWarning";',
    );
    expect(rootTsx).not.toContain("function GeneratedWarning");
    expect(fallbackTsx).toContain('import type { ReactNode } from "react";');
    expect(fallbackTsx).toContain(
      'import styles from "./GeneratedWarning.module.css";',
    );
    expect(fallbackTsx).toContain(
      "export function GeneratedWarning({ children }: GeneratedWarningProps)",
    );
    expect(fallbackTsx).toContain(
      '<div className={styles["ui_actions"]}>{children}</div>',
    );
    expect(fallbackCss).toContain(".ui_actions {");
    expect(result.report.statistics.filesByKind).toEqual({
      tsx: 1,
      cssModule: 1,
      fallbackTsx: 1,
      fallbackCssModule: 1,
    });
  });
});

function withStackStaticProps(
  input: ReactGenerationInput,
): ReactGenerationInput {
  return {
    ...input,
    pack: {
      ...input.pack,
      reactRenderRecipes: {
        ...input.pack.reactRenderRecipes,
        components: input.pack.reactRenderRecipes.components.map((recipe) =>
          recipe.componentId === "mui.Stack"
            ? {
                ...recipe,
                staticProps: [
                  {
                    target: "zeta",
                    value: { kind: "literal", value: true },
                    reason: "render-only",
                  },
                  {
                    target: "alpha",
                    value: { kind: "empty-array" },
                    reason: "render-only",
                  },
                ],
              }
            : recipe,
        ),
      },
    },
  };
}

function resolutionBase(
  node: ResolutionPlanV2["nodes"][number],
): Pick<
  ResolutionPlanV2["nodes"][number],
  | "manifestNodeId"
  | "semanticRole"
  | "confidence"
  | "evidence"
  | "diagnosticCodes"
> {
  return {
    manifestNodeId: node.manifestNodeId,
    semanticRole: node.semanticRole,
    confidence: node.confidence,
    evidence: node.evidence,
    diagnosticCodes: node.diagnosticCodes,
  };
}

async function fixture(): Promise<ReactGenerationInput> {
  const pack = await loadDesignSystemPackV2(materialUiPack);
  const designIr: DesignIRV2 = {
    schema: "design-ir/v2",
    sourceArtifactId: "pixso_fixture",
    dslVersion: "2.1.15",
    rootNodeId: "4:314",
    nodes: {
      "4:314": designNode("4:314", ["4:315"]),
      "4:315": designNode("4:315", []),
    },
    diagnostics: [],
  };
  const uiManifest: UiManifestV2 = {
    schema: "ui-manifest/v2",
    sourceArtifactId: "pixso_fixture",
    root: {
      id: "ui_actions",
      kind: "group",
      role: "actionGroup",
      sourceNodeIds: ["4:314"],
      layoutSourceNodeId: "4:314",
      confidence: 1,
      evidence: [{ kind: "semantic-role", value: "actionGroup" }],
      children: [],
    },
    diagnostics: [],
  };
  const resolutionPlan: ResolutionPlanV2 = {
    schema: "resolution-plan/v2",
    source: {
      designIr: {
        artifactId: "pixso_fixture",
        schema: "design-ir/v2",
        sha256: sha256(stableStringify(designIr)),
      },
      uiManifest: {
        artifactId: "pixso_fixture",
        schema: "ui-manifest/v2",
        sha256: sha256(stableStringify(uiManifest)),
      },
    },
    target: {
      framework: "react",
      language: "typescript",
      designSystem: pack.manifest.id,
      designSystemVersion: pack.manifest.version,
      packSha256: pack.sha256,
    },
    nodes: [
      {
        manifestNodeId: "ui_actions",
        semanticRole: "actionGroup",
        confidence: 1,
        evidence: [{ kind: "semantic-role", value: "actionGroup" }],
        diagnosticCodes: [],
        decision: "reuse",
        binding: {
          componentId: "mui.Stack",
          package: "@mui/material",
          export: "Stack",
          exportKind: "named",
        },
        props: {},
      },
    ],
    diagnostics: [],
    summary: { reuse: 1, compose: 0, fallback: 0, blocked: 0 },
  };
  return {
    sourceRunId: "run_fixture",
    designIr,
    uiManifest,
    resolutionPlan,
    pack,
  };
}

function designNode(
  id: string,
  children: string[],
): DesignIRV2["nodes"][string] {
  return {
    id,
    type: "frame",
    name: id,
    visible: true,
    children,
    geometry: { x: 0, y: 0, width: 100, height: 40 },
    appearance: {
      fills: [],
      borders: [],
      radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      shadows: [],
      opacity: 1,
    },
    source: { provider: "pixso", nodeId: id },
  };
}
