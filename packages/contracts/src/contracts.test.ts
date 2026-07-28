import { describe, expect, it } from "vitest";

import {
  DesignIRSchema,
  DesignSnapshotSchema,
  DesignSummarySchema,
  DesignSystemPackSchema,
  GenerationRunSchema,
  PixsoMapSchema,
  ResolutionPlanSchema,
  UiManifestSchema,
  validateWithSchema,
} from "./index.js";

const diagnostic = {
  severity: "warning",
  blocking: false,
  stage: "normalization",
  code: "DESIGN_VALUE_INVALID",
  message: "Unsupported value was preserved as a diagnostic",
};

const snapshot = {
  schema: "design-snapshot/v1",
  artifactId: "pixso_file_4-314_a81f9c",
  provider: "pixso",
  source: {
    documentId: "file",
    nodeId: "4:314",
    url: "https://pixso.net/app/design/file?item-id=4%3A314",
  },
  retrievedAt: "2026-07-26T10:30:00.000Z",
  content: {
    format: "pixso-node-dsl",
    version: "2.1.15",
    sha256: "a".repeat(64),
    byteLength: 10,
  },
};

const designIr = {
  schema: "design-ir/v1",
  sourceArtifactId: snapshot.artifactId,
  dslVersion: "2.1.15",
  rootNodeId: "4:314",
  nodes: {
    "4:314": {
      id: "4:314",
      type: "frame",
      name: "Modal",
      visible: true,
      children: [],
      geometry: { x: 0, y: 0, width: 600, height: 267 },
      appearance: {
        fills: [],
        borders: [],
        radii: {
          topLeft: 0,
          topRight: 0,
          bottomRight: 0,
          bottomLeft: 0,
        },
        shadows: [],
        opacity: 1,
      },
      source: { provider: "pixso", nodeId: "4:314" },
    },
  },
  diagnostics: [diagnostic],
};

const summary = {
  schema: "design-summary/v1",
  artifactId: snapshot.artifactId,
  root: {
    id: "4:314",
    name: "Modal",
    type: "frame",
    size: { width: 600, height: 267 },
  },
  statistics: {
    nodeCount: 1,
    visibleNodeCount: 1,
    textNodeCount: 0,
    componentInstanceCount: 0,
  },
  outline: [
    {
      id: "4:314",
      depth: 0,
      type: "frame",
      name: "Modal",
      childCount: 0,
    },
  ],
  notableNodes: [],
  truncated: false,
};

const manifest = {
  schema: "ui-manifest/v1",
  sourceArtifactId: snapshot.artifactId,
  root: {
    id: "ui_dialog_4-314",
    kind: "overlay",
    role: "dialog",
    sourceNodeIds: ["4:314"],
    confidence: 1,
    evidence: [{ kind: "exact-component", value: "modal-key" }],
    children: [],
  },
  diagnostics: [],
};

const pack = {
  schema: "design-system-pack/v1",
  id: "sber-space-ui",
  name: "Sber Space UI",
  version: "0.1.0",
  framework: "react",
  files: {
    catalog: "catalog.json",
    semanticPolicy: "semantic-policy.json",
    pixsoMap: "pixso-map.json",
    compositionRules: "composition-rules.json",
    tokens: "tokens.json",
    verification: "verification.json",
  },
};

const resolutionPlan = {
  schema: "resolution-plan/v1",
  sourceManifestId: "manifest-4-314",
  target: {
    framework: "react",
    language: "typescript",
    designSystem: "sber-space-ui",
  },
  nodes: [
    {
      manifestNodeId: "ui_dialog_4-314",
      semanticRole: "dialog",
      decision: "blocked",
      confidence: 0,
      evidence: [],
      diagnosticCodes: ["COMPONENT_UNRESOLVED"],
    },
  ],
  diagnostics: [
    {
      severity: "error",
      blocking: true,
      stage: "component-resolution",
      code: "COMPONENT_UNRESOLVED",
      message: "No verified dialog component",
    },
  ],
  summary: { reuse: 0, compose: 0, fallback: 0, blocked: 1 },
};

const generationRun = {
  schema: "generation-run/v1",
  runId: "run_20260726T103000000Z_4-314",
  status: "blocked",
  stages: {
    fetch: "completed",
    normalize: "completed",
    summarize: "completed",
    plan: "completed",
    resolve: "blocked",
  },
  artifacts: {
    snapshot: "snapshot.json",
    designIr: "design-ir.json",
    designSummary: "design-summary.json",
    uiManifest: "ui-manifest.json",
    resolutionPlan: "resolution-plan.sber-space-ui.json",
    diagnostics: "diagnostics.json",
  },
};

describe("public contracts", () => {
  it.each([
    ["DesignSnapshot", DesignSnapshotSchema, snapshot],
    ["DesignIR", DesignIRSchema, designIr],
    ["DesignSummary", DesignSummarySchema, summary],
    ["UiManifest", UiManifestSchema, manifest],
    ["DesignSystemPack", DesignSystemPackSchema, pack],
    ["ResolutionPlan", ResolutionPlanSchema, resolutionPlan],
    ["GenerationRun", GenerationRunSchema, generationRun],
  ])("accepts a minimal valid %s", (_name, schema, value) => {
    expect(validateWithSchema(schema, value)).toEqual(value);
  });

  it("rejects unknown DesignSnapshot fields", () => {
    expect(() =>
      validateWithSchema(DesignSnapshotSchema, {
        ...snapshot,
        cachePath: "/private/path",
      }),
    ).toThrow(/cachePath/);
  });

  it("rejects a missing required field", () => {
    const { rootNodeId: _removed, ...withoutRoot } = designIr;

    expect(() => validateWithSchema(DesignIRSchema, withoutRoot)).toThrow(
      /rootNodeId/,
    );
  });

  it("rejects an unsupported schema version", () => {
    expect(() =>
      validateWithSchema(DesignSummarySchema, {
        ...summary,
        schema: "design-summary/v2",
      }),
    ).toThrow(/schema/);
  });

  it("rejects an import binding on a blocked resolution", () => {
    expect(() =>
      validateWithSchema(ResolutionPlanSchema, {
        ...resolutionPlan,
        nodes: [
          {
            ...resolutionPlan.nodes[0],
            binding: {
              componentId: "base.Modal",
              package: "@sber-space-ui/modal",
              export: "Modal",
              exportKind: "named",
            },
          },
        ],
      }),
    ).toThrow(/binding/);
  });

  it("accepts v1 and v2 Pixso maps without widening v1", () => {
    const v1Map = {
      schema: "pixso-map/v1",
      mappings: [
        {
          componentKey: "ActionGroup",
          kind: "group",
          role: "actionGroup",
        },
      ],
    };
    const projection = {
      kind: "action-group",
      candidate: "button-shape-with-visible-label",
      order: "visual",
      roles: ["secondaryAction", "primaryAction"],
    };
    const v2Map = {
      schema: "pixso-map/v2",
      mappings: [{ ...v1Map.mappings[0], projection }],
    };

    expect(validateWithSchema(PixsoMapSchema, v1Map)).toEqual(v1Map);
    expect(validateWithSchema(PixsoMapSchema, v2Map)).toEqual(v2Map);
    expect(() =>
      validateWithSchema(PixsoMapSchema, {
        ...v1Map,
        mappings: [{ ...v1Map.mappings[0], projection }],
      }),
    ).toThrow(/projection/);
    expect(() =>
      validateWithSchema(PixsoMapSchema, {
        ...v2Map,
        mappings: [
          {
            ...v2Map.mappings[0],
            projection: { ...projection, roles: [] },
          },
        ],
      }),
    ).toThrow(/roles/);
  });
});
