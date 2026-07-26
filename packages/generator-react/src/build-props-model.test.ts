import type {
  ReactComponentRecipe,
  ResolutionNode,
  UiNodeV2,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { ReactGenerationError } from "./errors.js";
import { buildPropsModel } from "./build-props-model.js";

describe("buildPropsModel", () => {
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
        { name: "variant", value: { kind: "literal", value: "primary" } },
        { name: "disabled", value: { kind: "literal", value: true } },
        {
          name: "onClick",
          value: { kind: "external-prop", propName: "onConfirm" },
        },
        {
          name: "className",
          value: { kind: "class-name", className: "ui_action" },
        },
      ],
      externalProps: [
        {
          name: "onConfirm",
          optional: true,
          type: "() => void",
          interactionKey: "confirm",
        },
      ],
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
