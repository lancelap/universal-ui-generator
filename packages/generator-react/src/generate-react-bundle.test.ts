import { fileURLToPath } from "node:url";

import { loadDesignSystemPackV2 } from "@uig/component-catalog";
import { resolveUiManifestV2 } from "@uig/component-resolver";
import {
  type DesignIRV2,
  type ResolutionPlanV2,
  stableStringify,
  type UiManifestV2,
} from "@uig/contracts";
import { sha256 } from "@uig/design-context";
import { beforeAll, describe, expect, it } from "vitest";

import type { ReactGenerationInput } from "./generation-model.js";
import {
  assertReactGenerationBundleIntegrity,
  generateReactBundle,
} from "./generate-react-bundle.js";

const materialUiPack = fileURLToPath(
  new URL("../../../design-system-packs/material-ui", import.meta.url),
);
const sberUiPack = fileURLToPath(
  new URL("../../../design-system-packs/sber-space-ui", import.meta.url),
);

describe("generateReactBundle", () => {
  let input: ReactGenerationInput;
  let fallbackInput: ReactGenerationInput;
  let fallbackContainerInput: ReactGenerationInput;

  beforeAll(async () => {
    input = await fixture();
    fallbackInput = await fallbackFixture();
    fallbackContainerInput = await fixture(sberUiPack);
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
    const blocked = structuredClone(input) as ReactGenerationInput;
    blocked.uiManifest.root.requiredCapabilities = ["unsupported-capability"];
    blocked.resolutionPlan = resolveUiManifestV2({
      manifest: blocked.uiManifest,
      designIr: blocked.designIr,
      pack: blocked.pack,
    });

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

  it("keeps output report-only when the stored plan deletes a canonical blocker", () => {
    const blocked = structuredClone(input) as ReactGenerationInput;
    blocked.uiManifest.diagnostics.push({
      severity: "error",
      blocking: true,
      stage: "semantic-planning",
      code: "CANONICAL_MANIFEST_BLOCKER",
      message: "The exact UI manifest blocks generation",
      source: { manifestNodeId: blocked.uiManifest.root.id },
      evidence: {},
    });
    blocked.resolutionPlan = resolveUiManifestV2({
      manifest: blocked.uiManifest,
      designIr: blocked.designIr,
      pack: blocked.pack,
    });
    expect(blocked.resolutionPlan.summary.blocked).toBe(0);
    expect(
      blocked.resolutionPlan.nodes.every(
        (resolution) => resolution.decision !== "blocked",
      ),
    ).toBe(true);
    blocked.resolutionPlan.diagnostics = [];

    const result = generateReactBundle(blocked);

    expect(result).toMatchObject({
      status: "blocked",
      files: [],
      report: {
        status: "blocked",
        files: [],
        validation: { syntax: "not-run", targetTypecheck: "not-run" },
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "CANONICAL_MANIFEST_BLOCKER",
            blocking: true,
          }),
        ]),
      },
    });
  });

  it("emits linked fallback TSX and CSS-module artifacts", () => {
    const result = generateReactBundle(fallbackInput);
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

  it("reserves stable unique names for repeated fallback components", () => {
    const repeated = withCanonicalFallbackChildren(fallbackContainerInput, [
      {
        manifestNodeId: "ui_warning_a",
        designNodeId: "4:401",
        localComponentName: "GeneratedWarning",
      },
      {
        manifestNodeId: "ui_warning_b",
        designNodeId: "4:402",
        localComponentName: "GeneratedWarning",
      },
    ]);

    const first = generateReactBundle(repeated);
    const second = generateReactBundle(repeated);
    const rootTsx = source(first, "GeneratedModal.tsx");

    expect(first.files.map((file) => file.path)).toEqual([
      "GeneratedModal.module.css",
      "GeneratedModal.tsx",
      "fallbacks/GeneratedWarning_dd391a3f.module.css",
      "fallbacks/GeneratedWarning_dd391a3f.tsx",
      "fallbacks/GeneratedWarning_49434e1b.module.css",
      "fallbacks/GeneratedWarning_49434e1b.tsx",
    ]);
    expect(rootTsx).toContain(
      'import { GeneratedWarning_dd391a3f } from "./fallbacks/GeneratedWarning_dd391a3f";',
    );
    expect(rootTsx).toContain(
      'import { GeneratedWarning_49434e1b } from "./fallbacks/GeneratedWarning_49434e1b";',
    );
    expect(rootTsx).toContain("<GeneratedWarning_dd391a3f />");
    expect(rootTsx).toContain("<GeneratedWarning_49434e1b />");
    expect(fileMap(first)).toEqual(fileMap(second));
  });

  it("reserves fallback names that collide with the root or an imported local", () => {
    const colliding = withFallbackChildren(input, [
      {
        manifestNodeId: "ui_root_collision",
        designNodeId: "4:403",
        localComponentName: "GeneratedModal",
      },
      {
        manifestNodeId: "ui_import_collision",
        designNodeId: "4:404",
        localComponentName: "Stack",
      },
    ]);

    expect(() => generateReactBundle(colliding)).toThrowError(
      expect.objectContaining({ code: "GENERATION_INPUT_INVALID" }),
    );
  });

  it("reserves fallback names that collide with generated root bindings", () => {
    const colliding = withFallbackChildren(input, [
      {
        manifestNodeId: "ui_props_collision",
        designNodeId: "4:406",
        localComponentName: "GeneratedModalProps",
      },
    ]);

    expect(() => generateReactBundle(colliding)).toThrowError(
      expect.objectContaining({ code: "GENERATION_INPUT_INVALID" }),
    );
  });

  it("counts grouped named component imports by binding", () => {
    const grouped = withReuseWarningChild(input);

    const result = generateReactBundle(grouped);

    expect(source(result, "GeneratedModal.tsx")).toContain(
      'import { Alert, Stack } from "@mui/material";',
    );
    expect(result.report.statistics.imports).toBe(2);
  });

  it("rejects tampered bytes and duplicate bundle paths", () => {
    const generated = generateReactBundle(input);
    const tampered = structuredClone(generated);
    tampered.files[0]!.bytes = new TextEncoder().encode("tampered\n");
    const duplicate = structuredClone(generated);
    duplicate.files.push(structuredClone(duplicate.files[0]!));
    const wrongSchema = structuredClone(generated);
    (wrongSchema as { schema: string }).schema = "react-generation-bundle/v1";

    expect(() => assertReactGenerationBundleIntegrity(tampered)).toThrowError(
      expect.objectContaining({ code: "GENERATION_SOURCE_INVALID" }),
    );
    expect(() => assertReactGenerationBundleIntegrity(duplicate)).toThrowError(
      expect.objectContaining({ code: "GENERATION_SOURCE_INVALID" }),
    );
    expect(() =>
      assertReactGenerationBundleIntegrity(wrongSchema),
    ).toThrowError(
      expect.objectContaining({ code: "GENERATION_SOURCE_INVALID" }),
    );
  });
});

function withFallbackChildren(
  input: ReactGenerationInput,
  fallbacks: Array<{
    manifestNodeId: string;
    designNodeId: string;
    localComponentName: string;
  }>,
): ReactGenerationInput {
  const designIr = structuredClone(input.designIr);
  designIr.nodes[designIr.rootNodeId] = {
    ...designIr.nodes[designIr.rootNodeId]!,
    children: fallbacks.map((fallback) => fallback.designNodeId),
  };
  for (const fallback of fallbacks) {
    designIr.nodes[fallback.designNodeId] = designNode(
      fallback.designNodeId,
      [],
    );
  }
  const uiManifest = structuredClone(input.uiManifest);
  uiManifest.root.children = fallbacks.map((fallback) => ({
    id: fallback.manifestNodeId,
    kind: "content",
    role: "warning",
    sourceNodeIds: [fallback.designNodeId],
    layoutSourceNodeId: fallback.designNodeId,
    confidence: 1,
    evidence: [{ kind: "semantic-role", value: "warning" }],
    children: [],
  }));
  const resolutionPlan = structuredClone(input.resolutionPlan);
  resolutionPlan.source = {
    designIr: {
      artifactId: designIr.sourceArtifactId,
      schema: "design-ir/v2",
      sha256: sha256(stableStringify(designIr)),
    },
    uiManifest: {
      artifactId: uiManifest.sourceArtifactId,
      schema: "ui-manifest/v2",
      sha256: sha256(stableStringify(uiManifest)),
    },
  };
  resolutionPlan.nodes = [
    resolutionPlan.nodes[0]!,
    ...fallbacks.map((fallback): ResolutionPlanV2["nodes"][number] => ({
      manifestNodeId: fallback.manifestNodeId,
      semanticRole: "warning",
      confidence: 1,
      evidence: [{ kind: "semantic-role", value: "warning" }],
      diagnosticCodes: [],
      decision: "fallback",
      localComponentName: fallback.localComponentName,
      styleStrategy: "css-module",
    })),
  ];
  resolutionPlan.summary = {
    reuse: 1,
    compose: 0,
    fallback: fallbacks.length,
    blocked: 0,
  };
  return { ...input, designIr, uiManifest, resolutionPlan };
}

function withCanonicalFallbackChildren(
  input: ReactGenerationInput,
  fallbacks: Array<{
    manifestNodeId: string;
    designNodeId: string;
    localComponentName: string;
  }>,
): ReactGenerationInput {
  const changed = withFallbackChildren(input, fallbacks);
  changed.resolutionPlan = resolveUiManifestV2({
    manifest: changed.uiManifest,
    designIr: changed.designIr,
    pack: changed.pack,
  });
  return changed;
}

function withReuseWarningChild(
  input: ReactGenerationInput,
): ReactGenerationInput {
  const designIr = structuredClone(input.designIr);
  designIr.nodes[designIr.rootNodeId] = {
    ...designIr.nodes[designIr.rootNodeId]!,
    children: ["4:405"],
  };
  designIr.nodes["4:405"] = designNode("4:405", []);
  const uiManifest = structuredClone(input.uiManifest);
  uiManifest.root.children = [
    {
      id: "ui_warning",
      kind: "content",
      role: "warning",
      sourceNodeIds: ["4:405"],
      layoutSourceNodeId: "4:405",
      confidence: 1,
      evidence: [{ kind: "semantic-role", value: "warning" }],
      content: { text: "Warning" },
      children: [],
    },
  ];
  const resolutionPlan = resolveUiManifestV2({
    manifest: uiManifest,
    designIr,
    pack: input.pack,
  });
  return { ...input, designIr, uiManifest, resolutionPlan };
}

function source(
  bundle: ReturnType<typeof generateReactBundle>,
  path: string,
): string {
  return new TextDecoder().decode(
    bundle.files.find((file) => file.path === path)!.bytes,
  );
}

function fileMap(bundle: ReturnType<typeof generateReactBundle>) {
  return bundle.files.map((file) => ({
    ...file,
    bytes: [...file.bytes],
  }));
}

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

async function fixture(
  packPath = materialUiPack,
): Promise<ReactGenerationInput> {
  const pack = await loadDesignSystemPackV2(packPath);
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
  const resolutionPlan = resolveUiManifestV2({
    manifest: uiManifest,
    designIr,
    pack,
  });
  return {
    sourceRunId: "run_fixture",
    designIr,
    uiManifest,
    resolutionPlan,
    pack,
  };
}

async function fallbackFixture(): Promise<ReactGenerationInput> {
  const input = await fixture(sberUiPack);
  input.uiManifest.root.kind = "content";
  input.uiManifest.root.role = "warning";
  input.uiManifest.root.evidence = [
    { kind: "semantic-role", value: "warning" },
  ];
  input.resolutionPlan = resolveUiManifestV2({
    manifest: input.uiManifest,
    designIr: input.designIr,
    pack: input.pack,
  });
  return input;
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
