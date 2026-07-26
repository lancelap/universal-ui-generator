import type { ReactRenderRecipes, ResolutionNode } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { ReactGenerationError } from "./errors.js";
import { buildImportModel } from "./build-import-model.js";

describe("buildImportModel", () => {
  it("groups named bindings, separates defaults, and collapses duplicates", () => {
    const resolutions = [
      reuse("ui_button", binding("base.Button", "@ui/core", "Button", "named")),
      reuse("ui_stack", binding("base.Stack", "@ui/core", "Stack", "named")),
      reuse(
        "ui_button_duplicate",
        binding("base.Button", "@ui/core", "Button", "named"),
      ),
      reuse("ui_logo", binding("base.Logo", "@ui/assets", "Logo", "default")),
      reuse("ui_mark", binding("base.Mark", "@ui/assets", "Mark", "default")),
    ];

    expect(buildImportModel(resolutions, recipes(resolutions))).toEqual([
      {
        kind: "default",
        package: "@ui/assets",
        componentId: "base.Logo",
        imported: "Logo",
        local: "Logo",
      },
      {
        kind: "default",
        package: "@ui/assets",
        componentId: "base.Mark",
        imported: "Mark",
        local: "Mark",
      },
      {
        kind: "named",
        package: "@ui/core",
        specifiers: [
          {
            componentId: "base.Button",
            imported: "Button",
            local: "Button",
          },
          {
            componentId: "base.Stack",
            imported: "Stack",
            local: "Stack",
          },
        ],
      },
    ]);
  });

  it("assigns stable aliases when different bindings expose the same local name", () => {
    const first = reuse(
      "ui_first",
      binding("alpha.Button", "@alpha/ui", "Button", "named"),
    );
    const second = reuse(
      "ui_second",
      binding("beta.Button", "@beta/ui", "Button", "named"),
    );
    const expected = [
      {
        kind: "named",
        package: "@alpha/ui",
        specifiers: [
          {
            componentId: "alpha.Button",
            imported: "Button",
            local: "AlphaButton",
          },
        ],
      },
      {
        kind: "named",
        package: "@beta/ui",
        specifiers: [
          {
            componentId: "beta.Button",
            imported: "Button",
            local: "BetaButton",
          },
        ],
      },
    ];

    expect(buildImportModel([first, second], recipes([first, second]))).toEqual(
      expected,
    );
    expect(buildImportModel([second, first], recipes([first, second]))).toEqual(
      expected,
    );
  });

  it("rejects a resolved binding that has no render recipe", () => {
    const resolution = reuse(
      "ui_button",
      binding("base.Button", "@ui/core", "Button", "named"),
    );

    expect(() =>
      buildImportModel([resolution], {
        schema: "react-render-recipes/v1",
        components: [],
        compositions: [],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_INPUT_INVALID",
      }),
    );
  });

  it("never imports recipe components absent from the resolution", () => {
    const resolution = reuse(
      "ui_button",
      binding("base.Button", "@ui/core", "Button", "named"),
    );
    const renderRecipes = recipes([
      resolution,
      reuse("ui_unused", binding("base.Unused", "@ui/core", "Unused", "named")),
    ]);

    const model = buildImportModel([resolution], renderRecipes);

    expect(JSON.stringify(model)).not.toContain("Unused");
  });
});

function reuse(
  manifestNodeId: string,
  componentBinding: ReturnType<typeof binding>,
): ResolutionNode {
  return {
    manifestNodeId,
    semanticRole: "content",
    confidence: 1,
    evidence: [],
    diagnosticCodes: [],
    decision: "reuse",
    binding: componentBinding,
    props: {},
  };
}

function binding(
  componentId: string,
  packageName: string,
  exportName: string,
  exportKind: "named" | "default",
) {
  return {
    componentId,
    package: packageName,
    export: exportName,
    exportKind,
  };
}

function recipes(resolutions: ResolutionNode[]): ReactRenderRecipes {
  const componentIds = new Set(
    resolutions.flatMap((resolution) =>
      resolution.decision === "reuse"
        ? [resolution.binding.componentId]
        : resolution.decision === "compose"
          ? resolution.bindings.map((item) => item.componentId)
          : [],
    ),
  );
  return {
    schema: "react-render-recipes/v1",
    components: [...componentIds].map((componentId) => ({
      componentId,
      stateProps: [],
      eventProps: [],
      semanticChildrenPolicy: "optional",
      wrapper: "allowed",
      provenance: { kind: "test", source: "test fixture" },
    })),
    compositions: [],
  };
}
