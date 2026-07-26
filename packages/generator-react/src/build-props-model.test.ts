import type {
  ReactComponentRecipe,
  ReactComponentRecipeV2,
  ResolutionNode,
  UiNodeV2,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { ReactGenerationError } from "./errors.js";
import { buildPropsModel } from "./build-props-model.js";

describe("buildPropsModel", () => {
  it("lowers sorted render-only static props into the element model", () => {
    const result = buildPropsModel(
      actionNode({}),
      reuseResolution({}),
      recipeWithStaticProps(),
    );

    expect(result.elementProps).toEqual([
      { name: "mode", value: { kind: "literal", value: "dropdown" } },
      { name: "onChange", value: { kind: "noop" } },
      { name: "options", value: { kind: "empty-array" } },
      { name: "value", value: { kind: "literal", value: "" } },
    ]);
    expect(result.renderOnlyPropNames).toEqual([
      "mode",
      "onChange",
      "options",
      "value",
    ]);
  });

  it("applies higher prop sources over render-only static props", () => {
    const recipe = recipeWithStaticProps({
      stateProps: [
        {
          source: "state.placeholder",
          target: "mode",
          valueType: "string",
        },
      ],
      eventProps: [{ source: "change", target: "onChange" }],
    });
    const result = buildPropsModel(
      actionNode({
        state: { placeholder: "semantic" },
        interactions: [{ key: "value", event: "change", valueType: "string" }],
      }),
      reuseResolution({ mode: "resolution" }),
      recipe,
    );

    expect(result.elementProps).toEqual([
      { name: "mode", value: { kind: "literal", value: "semantic" } },
      {
        name: "onChange",
        value: { kind: "external-prop", propName: "onValue" },
      },
      { name: "options", value: { kind: "empty-array" } },
      { name: "value", value: { kind: "literal", value: "" } },
    ]);
    expect(result.renderOnlyPropNames).toEqual(["options", "value"]);
  });

  it("replaces a static children prop with semantic text content", () => {
    const result = buildPropsModel(
      actionNode({ content: { label: "Continue" } }),
      reuseResolution({}),
      recipeWithStaticProps({
        staticProps: [
          {
            target: "children",
            value: { kind: "literal", value: "render-only placeholder" },
            reason: "render-only",
          },
        ],
        content: { source: "content.label", target: "children" },
      }),
    );

    expect(result.elementProps).toEqual([]);
    expect(result.renderOnlyPropNames).toEqual([]);
    expect(result.textChild).toEqual({ kind: "text", value: "Continue" });
  });

  it("replaces a resolution-default children prop with semantic text content", () => {
    const result = buildPropsModel(
      actionNode({ content: { label: "Continue" } }),
      reuseResolution({ children: "resolution placeholder" }),
      recipeWithStaticProps({
        staticProps: [],
        content: { source: "content.label", target: "children" },
      }),
    );

    expect(result.elementProps).toEqual([]);
    expect(result.renderOnlyPropNames).toEqual([]);
    expect(result.textChild).toEqual({ kind: "text", value: "Continue" });
  });

  it("lowers defaults, text children, typed state, callbacks, and class hooks", () => {
    const node = actionNode({
      content: { label: "Continue" },
      state: { disabled: true },
      interactions: [{ key: "confirm", event: "activate", valueType: "void" }],
    });
    const result = buildPropsModel(
      node,
      reuseResolution({ variant: "primary" }),
      buttonRecipe(),
    );

    expect(result).toEqual({
      elementProps: [
        {
          name: "className",
          value: { kind: "class-name", className: "ui_action" },
        },
        { name: "disabled", value: { kind: "literal", value: true } },
        {
          name: "onClick",
          value: { kind: "external-prop", propName: "onConfirm" },
        },
        { name: "variant", value: { kind: "literal", value: "primary" } },
      ],
      externalProps: [
        {
          name: "onConfirm",
          optional: true,
          type: "() => void",
          interactionKey: "confirm",
        },
      ],
      renderOnlyPropNames: [],
      textChild: { kind: "text", value: "Continue" },
    });
    expect(result.elementProps.some((prop) => prop.name === "children")).toBe(
      false,
    );
  });

  it("creates a typed string change callback", () => {
    const node = actionNode({
      content: { value: "Initial" },
      interactions: [{ key: "value", event: "change", valueType: "string" }],
    });
    const recipe: ReactComponentRecipe = {
      componentId: "mui.TextField",
      content: { source: "content.value", target: "value" },
      stateProps: [],
      eventProps: [{ source: "change", target: "onChange" }],
      semanticChildrenPolicy: "forbidden",
      wrapper: "allowed",
      provenance: { kind: "test", source: "test fixture" },
    };

    const result = buildPropsModel(node, reuseResolution({}), recipe);

    expect(result.externalProps).toEqual([
      {
        name: "onValue",
        optional: true,
        type: "(value: string) => void",
        interactionKey: "value",
      },
    ]);
    expect(result.elementProps).toContainEqual({
      name: "onChange",
      value: { kind: "external-prop", propName: "onValue" },
    });
  });

  it("rejects normalized callback names with incompatible types", () => {
    const node = actionNode({
      content: { label: "Continue" },
      interactions: [
        { key: "confirm-action", event: "activate", valueType: "void" },
        { key: "confirm_action", event: "change", valueType: "string" },
      ],
    });
    const recipe = buttonRecipe();
    recipe.eventProps.push({ source: "change", target: "onChange" });

    expect(() =>
      buildPropsModel(node, reuseResolution({}), recipe),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_PROP_CONFLICT",
      }),
    );
  });

  it("rejects missing required content without coercing it", () => {
    const node = actionNode({});

    expect(() =>
      buildPropsModel(node, reuseResolution({}), buttonRecipe()),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_INPUT_INCOMPLETE",
      }),
    );
  });

  it("does not invent a callback when the semantic node has no interaction", () => {
    const result = buildPropsModel(
      actionNode({ content: { label: "Continue" } }),
      reuseResolution({}),
      buttonRecipe(),
    );

    expect(result.externalProps).toEqual([]);
    expect(result.elementProps.some((prop) => prop.name === "onClick")).toBe(
      false,
    );
  });
});

function actionNode(overrides: Partial<UiNodeV2>): UiNodeV2 {
  return {
    id: "ui_action",
    kind: "action",
    role: "primaryAction",
    sourceNodeIds: ["4:315"],
    layoutSourceNodeId: "4:315",
    confidence: 1,
    evidence: [],
    children: [],
    ...overrides,
  };
}

function reuseResolution(props: Record<string, unknown>): ResolutionNode {
  return {
    manifestNodeId: "ui_action",
    semanticRole: "primaryAction",
    confidence: 1,
    evidence: [],
    diagnosticCodes: [],
    decision: "reuse",
    binding: {
      componentId: "mui.Button",
      package: "@mui/material",
      export: "Button",
      exportKind: "named",
    },
    props,
  };
}

function buttonRecipe(): ReactComponentRecipe {
  return {
    componentId: "mui.Button",
    content: { source: "content.label", target: "children" },
    stateProps: [
      {
        source: "state.disabled",
        target: "disabled",
        valueType: "boolean",
      },
    ],
    eventProps: [{ source: "activate", target: "onClick" }],
    classNameProp: "className",
    semanticChildrenPolicy: "forbidden",
    wrapper: "allowed",
    provenance: { kind: "test", source: "test fixture" },
  };
}

function recipeWithStaticProps(
  overrides: Partial<ReactComponentRecipeV2> = {},
): ReactComponentRecipeV2 {
  return {
    componentId: "base.Autocomplete",
    staticProps: [
      {
        target: "options",
        value: { kind: "empty-array" },
        reason: "render-only",
      },
      {
        target: "onChange",
        value: { kind: "noop" },
        reason: "render-only",
      },
      {
        target: "mode",
        value: { kind: "literal", value: "dropdown" },
        reason: "render-only",
      },
      {
        target: "value",
        value: { kind: "literal", value: "" },
        reason: "render-only",
      },
    ],
    stateProps: [],
    eventProps: [],
    semanticChildrenPolicy: "forbidden",
    wrapper: "allowed",
    provenance: { kind: "test", source: "test fixture" },
    ...overrides,
  };
}
