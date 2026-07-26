import type {
  DesignNodeV2,
  ReactComponentRecipeV2,
  ReactStylePolicy,
  UiNodeV2,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { ReactGenerationError } from "./errors.js";
import { buildStyleModel } from "./build-style-model.js";

describe("buildStyleModel", () => {
  it("lowers a vertical flow layout in the fixed declaration order", () => {
    const result = buildStyleModel({
      node: node("ui_stack"),
      designNode: designNode({
        layout: {
          mode: "vertical",
          gap: 10,
          padding: { top: 20, right: 16, bottom: 20, left: 16 },
          alignItems: "stretch",
        },
      }),
      componentId: "base.Stack",
      recipe: recipe(),
      policy: policy({
        layout: ["display", "flexDirection", "gap", "padding"],
      }),
    });

    expect(result.rules).toEqual([
      {
        className: "ui_stack",
        declarations: [
          { property: "display", value: "flex" },
          { property: "flexDirection", value: "column" },
          { property: "gap", value: "10px" },
          { property: "padding", value: "20px 16px" },
        ],
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("lowers horizontal alignment, wrapping, and only policy-permitted dimensions", () => {
    const result = buildStyleModel({
      node: node("ui_row"),
      designNode: designNode({
        geometry: { x: 0, y: 0, width: 320, height: 48 },
        layout: {
          mode: "horizontal",
          gap: 8,
          padding: { top: 1, right: 2, bottom: 3, left: 4 },
          alignItems: "center",
          justifyContent: "space-between",
          wrap: true,
        },
      }),
      componentId: "base.Row",
      recipe: recipe(),
      policy: policy({
        layout: [
          "display",
          "flexDirection",
          "flexWrap",
          "alignItems",
          "justifyContent",
          "gap",
          "padding",
          "height",
        ],
      }),
    });

    expect(result.rules[0]?.declarations).toEqual([
      { property: "display", value: "flex" },
      { property: "flexDirection", value: "row" },
      { property: "flexWrap", value: "wrap" },
      { property: "alignItems", value: "center" },
      { property: "justifyContent", value: "space-between" },
      { property: "gap", value: "8px" },
      { property: "padding", value: "1px 2px 3px 4px" },
      { property: "height", value: "48px" },
    ]);
    expect(
      result.rules[0]?.declarations.some(
        (declaration) => declaration.property === "width",
      ),
    ).toBe(false);
  });

  it("keeps flow positioning in normal flow and lowers explicit absolute insets only", () => {
    const base = {
      node: node("ui_positioned"),
      componentId: "base.Positioned",
      recipe: recipe(),
      policy: policy({ layout: ["position", "inset"] }),
    };

    expect(
      buildStyleModel({
        ...base,
        designNode: designNode({}),
      }).rules,
    ).toEqual([]);
    expect(
      buildStyleModel({
        ...base,
        designNode: designNode({ position: { mode: "flow" } }),
      }).rules,
    ).toEqual([]);
    expect(
      buildStyleModel({
        ...base,
        designNode: designNode({
          position: {
            mode: "absolute",
            inset: { top: 8, right: 12, bottom: 16, left: 4 },
          },
        }),
        parentPositioning: { canAttach: true, positionAllowed: true },
      }).rules,
    ).toEqual([
      {
        className: "ui_positioned",
        declarations: [
          { property: "position", value: "absolute" },
          { property: "inset", value: "8px 12px 16px 4px" },
        ],
      },
    ]);
  });

  it("blocks explicit absolute positioning when the policy cannot express it", () => {
    expect(() =>
      buildStyleModel({
        node: node("ui_positioned"),
        designNode: designNode({
          position: { mode: "absolute", inset: { top: 8, left: 4 } },
        }),
        componentId: "base.Positioned",
        recipe: recipe(),
        policy: policy({ layout: [] }),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_LAYOUT_UNSUPPORTED",
      }),
    );
  });

  it("blocks root absolute positioning without legal relative-parent evidence", () => {
    expect(() =>
      buildStyleModel({
        node: node("ui_root"),
        designNode: designNode({
          position: { mode: "absolute", inset: { top: 8, left: 4 } },
        }),
        componentId: "base.Positioned",
        recipe: recipe(),
        policy: policy({ layout: ["position", "inset"] }),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_LAYOUT_UNSUPPORTED",
      }),
    );
  });

  it("warns instead of overriding forbidden non-structural appearance", () => {
    const result = buildStyleModel({
      node: node("ui_notice"),
      designNode: designNode({
        appearance: {
          fills: [],
          borders: [],
          radii: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
          shadows: [],
          opacity: 1,
        },
      }),
      componentId: "base.Notice",
      recipe: recipe(),
      policy: policy({ appearance: [] }),
    });

    expect(result.rules).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        blocking: false,
        stage: "react-generation",
        code: "GENERATION_STYLE_OVERRIDE_FORBIDDEN",
      }),
    ]);
  });

  it("emits only the typed allowlisted CSS properties without selectors or priorities", () => {
    const result = buildStyleModel({
      node: node("ui_safe"),
      designNode: designNode({
        appearance: {
          fills: [{ type: "solid", color: "#112233", opacity: 1 }],
          borders: [],
          radii: { topLeft: 4, topRight: 4, bottomRight: 4, bottomLeft: 4 },
          shadows: [],
          opacity: 0.5,
        },
        text: {
          value: "Notice",
          fontFamily: "Inter",
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 20,
          textAlign: "center",
        },
      }),
      componentId: "base.Safe",
      recipe: recipe(),
      policy: policy({
        appearance: [
          "background",
          "borderRadius",
          "opacity",
          "fontFamily",
          "fontSize",
          "fontWeight",
          "lineHeight",
          "textAlign",
        ],
      }),
    });

    const declarations = result.rules[0]?.declarations ?? [];
    expect(declarations.map((declaration) => declaration.property)).toEqual([
      "background",
      "borderRadius",
      "opacity",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "textAlign",
    ]);
    expect(result.rules[0]?.className).toBe("ui_safe");
    expect(
      declarations.every(({ value }) => !value.includes("!important")),
    ).toBe(true);
  });
});

function node(id: string): UiNodeV2 {
  return {
    id,
    kind: "group",
    role: "content",
    sourceNodeIds: ["source"],
    layoutSourceNodeId: "source",
    confidence: 1,
    evidence: [],
    children: [],
  };
}

function designNode(overrides: Partial<DesignNodeV2>): DesignNodeV2 {
  return {
    id: "source",
    type: "frame",
    name: "source",
    visible: true,
    children: [],
    geometry: { x: 0, y: 0, width: 100, height: 40 },
    appearance: {
      fills: [],
      borders: [],
      radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      shadows: [],
      opacity: 1,
    },
    source: { provider: "pixso", nodeId: "source" },
    ...overrides,
  };
}

function recipe(): ReactComponentRecipeV2 {
  return {
    componentId: "base.Component",
    staticProps: [],
    stateProps: [],
    eventProps: [],
    semanticChildrenPolicy: "optional",
    wrapper: "allowed",
    provenance: { kind: "test", source: "style fixture" },
  };
}

function policy(input: {
  layout?: ReactStylePolicy["defaults"]["layout"]["allowed"];
  appearance?: ReactStylePolicy["defaults"]["appearance"]["allowed"];
}): ReactStylePolicy {
  return {
    schema: "react-style-policy/v1",
    defaults: {
      layout: { allowed: [] },
      appearance: { allowed: [] },
      internalSelectors: false,
      inlineStyles: false,
    },
    components: [
      {
        componentId: "base.Stack",
        layout: { allowed: input.layout ?? [] },
        appearance: { allowed: input.appearance ?? [] },
        wrapper: "allowed",
      },
      {
        componentId: "base.Row",
        layout: { allowed: input.layout ?? [] },
        appearance: { allowed: input.appearance ?? [] },
        wrapper: "allowed",
      },
      {
        componentId: "base.Positioned",
        layout: { allowed: input.layout ?? [] },
        appearance: { allowed: input.appearance ?? [] },
        wrapper: "allowed",
      },
      {
        componentId: "base.Notice",
        layout: { allowed: input.layout ?? [] },
        appearance: { allowed: input.appearance ?? [] },
        wrapper: "allowed",
      },
      {
        componentId: "base.Safe",
        layout: { allowed: input.layout ?? [] },
        appearance: { allowed: input.appearance ?? [] },
        wrapper: "allowed",
      },
    ],
    fallback: { layout: "all-supported", appearance: "all-supported" },
    provenance: { kind: "test", source: "style fixture" },
  };
}
