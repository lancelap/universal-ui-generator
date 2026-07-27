import { fileURLToPath } from "node:url";

import {
  loadDesignSystemPackV2,
  type LoadedDesignSystemPackV2,
} from "@uig/component-catalog";
import { resolveUiManifestV2 } from "@uig/component-resolver";
import {
  type DesignIRV2,
  type Diagnostic,
  stableStringify,
  type UiManifestV2,
} from "@uig/contracts";
import { sha256 } from "@uig/design-context";
import { beforeAll, describe, expect, it } from "vitest";

import { ReactGenerationError } from "./errors.js";
import type { ReactGenerationInput } from "./generation-model.js";
import { validateGenerationInput } from "./validate-generation-input.js";

const muiPackPath = fileURLToPath(
  new URL("../../../design-system-packs/material-ui", import.meta.url),
);

describe("validateGenerationInput", () => {
  let pack: LoadedDesignSystemPackV2;

  beforeAll(async () => {
    pack = await loadDesignSystemPackV2(muiPackPath);
  });

  it("joins an exact v2 artifact set in manifest document order", () => {
    const result = validateGenerationInput(validInput(pack));

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.manifestNodes.map((node) => node.id)).toEqual([
        "ui_root",
        "ui_action",
      ]);
      expect([...result.resolutionsByManifestNodeId.keys()]).toEqual([
        "ui_root",
        "ui_action",
      ]);
    }
  });

  it.each([
    [
      "DesignIR hash mismatch",
      (input: ReactGenerationInput) => {
        input.designIr.nodes["4:314"]!.name = "Changed after resolution";
      },
    ],
    [
      "manifest hash mismatch",
      (input: ReactGenerationInput) => {
        input.uiManifest.root.content = { text: "Changed" };
      },
    ],
    [
      "pack ID mismatch",
      (input: ReactGenerationInput) => {
        input.resolutionPlan.target.designSystem = "other-system";
      },
    ],
    [
      "pack version mismatch",
      (input: ReactGenerationInput) => {
        input.resolutionPlan.target.designSystemVersion = "0.0.0";
      },
    ],
    [
      "pack hash mismatch",
      (input: ReactGenerationInput) => {
        input.resolutionPlan.target.packSha256 = "f".repeat(64);
      },
    ],
    [
      "missing resolution node",
      (input: ReactGenerationInput) => {
        input.resolutionPlan.nodes.pop();
      },
    ],
    [
      "duplicate resolution node",
      (input: ReactGenerationInput) => {
        input.resolutionPlan.nodes.push(
          structuredClone(input.resolutionPlan.nodes[0]!),
        );
      },
    ],
    [
      "extra resolution node",
      (input: ReactGenerationInput) => {
        const extra = structuredClone(input.resolutionPlan.nodes[0]!);
        extra.manifestNodeId = "ui_extra";
        input.resolutionPlan.nodes.push(extra);
      },
    ],
    [
      "missing layout anchor",
      (input: ReactGenerationInput) => {
        input.uiManifest.root.layoutSourceNodeId = "4:999";
        refreshManifestHash(input);
      },
    ],
    [
      "unresolved semantic node",
      (input: ReactGenerationInput) => {
        input.uiManifest.root.role = "unresolved";
        refreshManifestHash(input);
      },
    ],
    [
      "v1 DesignIR",
      (input: ReactGenerationInput) => {
        (input.designIr as { schema: string }).schema = "design-ir/v1";
        refreshDesignIrHash(input);
      },
    ],
    [
      "v1 manifest",
      (input: ReactGenerationInput) => {
        (input.uiManifest as { schema: string }).schema = "ui-manifest/v1";
        refreshManifestHash(input);
      },
    ],
    [
      "v1 resolution plan",
      (input: ReactGenerationInput) => {
        (input.resolutionPlan as { schema: string }).schema =
          "resolution-plan/v1";
      },
    ],
  ])("rejects %s with a typed input error", (_, mutate) => {
    const input = validInput(pack);
    mutate(input);

    expect(() => validateGenerationInput(input)).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_INPUT_INVALID",
      }),
    );
  });

  it.each([
    [
      "reuse binding package",
      (input: ReactGenerationInput) => {
        const resolution = input.resolutionPlan.nodes[0]!;
        if (resolution.decision === "reuse") {
          resolution.binding.package = "@attacker/components";
        }
      },
    ],
    [
      "reuse binding export",
      (input: ReactGenerationInput) => {
        const resolution = input.resolutionPlan.nodes[0]!;
        if (resolution.decision === "reuse") {
          resolution.binding.export = "AttackerStack";
        }
      },
    ],
    [
      "reuse binding export kind",
      (input: ReactGenerationInput) => {
        const resolution = input.resolutionPlan.nodes[0]!;
        if (resolution.decision === "reuse") {
          resolution.binding.exportKind = "default";
        }
      },
    ],
    [
      "reuse binding component",
      (input: ReactGenerationInput) => {
        const resolution = input.resolutionPlan.nodes[0]!;
        if (resolution.decision === "reuse") {
          resolution.binding.componentId = "mui.Button";
        }
      },
    ],
    [
      "reuse default props",
      (input: ReactGenerationInput) => {
        const resolution = input.resolutionPlan.nodes[0]!;
        if (resolution.decision === "reuse") {
          resolution.props = { direction: "attacker-controlled" };
        }
      },
    ],
    [
      "decision",
      (input: ReactGenerationInput) => {
        const resolution = input.resolutionPlan.nodes[1]!;
        input.resolutionPlan.nodes[1] = {
          manifestNodeId: resolution.manifestNodeId,
          semanticRole: resolution.semanticRole,
          confidence: resolution.confidence,
          evidence: resolution.evidence,
          decision: "fallback",
          localComponentName: "GeneratedPrimaryAction",
          styleStrategy: "css-module",
          diagnosticCodes: [],
        };
        input.resolutionPlan.summary = {
          reuse: 1,
          compose: 0,
          fallback: 1,
          blocked: 0,
        };
      },
    ],
  ])("rejects a pack-unauthorized %s", (_, mutate) => {
    const input = validInput(pack);
    mutate(input);

    expect(() => validateGenerationInput(input)).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_INPUT_INVALID",
      }),
    );
  });

  it.each([
    ["root binding", 0],
    ["required member binding", 1],
    ["slot binding", 3],
  ] as const)("rejects an unauthorized composition %s", (_, bindingIndex) => {
    const input = composedInput(pack);
    const resolution = input.resolutionPlan.nodes[0]!;
    if (resolution.decision !== "compose") {
      throw new Error("Expected a composed dialog fixture");
    }
    resolution.bindings[bindingIndex]!.package = "@attacker/components";

    expect(() => validateGenerationInput(input)).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_INPUT_INVALID",
      }),
    );
  });

  it("rejects unauthorized composition props", () => {
    const input = composedInput(pack);
    const resolution = input.resolutionPlan.nodes[0]!;
    if (resolution.decision !== "compose") {
      throw new Error("Expected a composed dialog fixture");
    }
    resolution.props = { open: true };

    expect(() => validateGenerationInput(input)).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_INPUT_INVALID",
      }),
    );
  });

  it("preserves a stored blocking diagnostic without treating it as authority", () => {
    const input = validInput(pack);
    const diagnostic: Diagnostic = {
      severity: "error",
      blocking: true,
      stage: "component-resolution",
      code: "COMPONENT_UNRESOLVED",
      message: "The component cannot be resolved",
      source: { manifestNodeId: "ui_action" },
      evidence: {},
    };
    input.resolutionPlan.diagnostics.push(diagnostic);

    const result = validateGenerationInput(input);

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "GENERATION_INPUT_BLOCKED",
            blocking: true,
          }),
        ]),
      );
    }
  });
});

function validInput(pack: LoadedDesignSystemPackV2): ReactGenerationInput {
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
    sourceArtifactId: designIr.sourceArtifactId,
    root: {
      id: "ui_root",
      kind: "group",
      role: "verticalGroup",
      sourceNodeIds: ["4:314"],
      layoutSourceNodeId: "4:314",
      confidence: 1,
      evidence: [{ kind: "semantic-role", value: "verticalGroup" }],
      children: [
        {
          id: "ui_action",
          kind: "action",
          role: "primaryAction",
          sourceNodeIds: ["4:315"],
          layoutSourceNodeId: "4:315",
          confidence: 1,
          evidence: [{ kind: "semantic-role", value: "primaryAction" }],
          content: { label: "Continue" },
          interactions: [
            { key: "confirm", event: "activate", valueType: "void" },
          ],
          children: [],
        },
      ],
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

function composedInput(pack: LoadedDesignSystemPackV2): ReactGenerationInput {
  const input = validInput(pack);
  input.uiManifest.root.kind = "overlay";
  input.uiManifest.root.role = "dialog";
  input.uiManifest.root.evidence = [{ kind: "semantic-role", value: "dialog" }];
  input.resolutionPlan = resolveUiManifestV2({
    manifest: input.uiManifest,
    designIr: input.designIr,
    pack,
  });
  return input;
}

function refreshManifestHash(input: ReactGenerationInput): void {
  input.resolutionPlan.source.uiManifest.sha256 = sha256(
    stableStringify(input.uiManifest),
  );
}

function refreshDesignIrHash(input: ReactGenerationInput): void {
  input.resolutionPlan.source.designIr.sha256 = sha256(
    stableStringify(input.designIr),
  );
}
