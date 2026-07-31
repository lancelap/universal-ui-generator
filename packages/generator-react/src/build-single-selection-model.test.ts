import type {
  ComponentBinding,
  ReactSingleSelectionCollectionRecipe,
  ResolutionNode,
  UiNodeV2,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { buildSingleSelectionModel } from "./build-single-selection-model.js";

describe("buildSingleSelectionModel", () => {
  it("lowers five ordered options into one render-only selection group", () => {
    const model = buildSingleSelectionModel(fixture());

    expect(model.kind).toBe("single-selection-collection");
    expect(model.sections.map((section) => section.options.length)).toEqual([
      2, 3,
    ]);
    expect(
      model.sections.flatMap((section) =>
        section.options.map((option) => option.id),
      ),
    ).toEqual(["one", "two", "three", "four", "five"]);
    expect(model.rootProps).toEqual([
      { name: "value", value: { kind: "literal", value: "" } },
      { name: "onChange", value: { kind: "noop" } },
      { name: "direction", value: { kind: "literal", value: "column" } },
      { name: "groupName", value: { kind: "literal", value: "Choose" } },
    ]);
    expect(
      model.sections
        .flatMap((section) => section.options)
        .map((option) => option.props.map((prop) => prop.name)),
    ).toEqual([["value"], ["value"], ["value"], ["value"], ["value"]]);
    expect(model.children).toEqual([]);
  });

  it("uses only resolved optional assets", () => {
    const withAssets = buildSingleSelectionModel(fixture());
    expect(withAssets).toMatchObject({
      leadingAssetLocalName: "Leading",
      trailingAssetLocalName: "Trailing",
    });
    expect(withAssets.sections[0]?.options[0]?.hasTrailingAsset).toBe(true);

    const withoutOptional = fixture();
    withoutOptional.resolution.bindings =
      withoutOptional.resolution.bindings.filter(
        (binding) => !binding.componentId.startsWith("asset."),
      );
    withoutOptional.localNames = new Map(
      [...withoutOptional.localNames].filter(
        ([componentId]) => !componentId.startsWith("asset."),
      ),
    );
    const withoutAssets = buildSingleSelectionModel(withoutOptional);
    expect(withoutAssets.leadingAssetLocalName).toBeUndefined();
    expect(withoutAssets.trailingAssetLocalName).toBeUndefined();
    expect(withoutAssets.sections[0]?.options[0]?.hasTrailingAsset).toBe(false);
  });

  it("blocks before emission when a required binding is absent", () => {
    const input = fixture();
    input.resolution.bindings = input.resolution.bindings.filter(
      (binding) => binding.componentId !== "base.Option",
    );

    expect(() => buildSingleSelectionModel(input)).toThrowError(
      expect.objectContaining({ code: "GENERATION_INPUT_INVALID" }),
    );
  });
});

function fixture(): Parameters<typeof buildSingleSelectionModel>[0] {
  const recipe: ReactSingleSelectionCollectionRecipe = {
    kind: "single-selection-collection",
    semanticRole: "choicePanel",
    rootComponentId: "base.Group",
    optionComponentId: "base.Option",
    layoutComponentId: "base.Layout",
    titleComponentId: "base.Title",
    descriptionComponentId: "base.Description",
    leadingAssetComponentId: "asset.Leading",
    trailingAssetComponentId: "asset.Trailing",
    sources: {
      title: "content.title",
      sections: "content.sections",
      selectedValue: "state.selectedOptionId",
    },
    rootProps: {
      valueTarget: "value",
      emptyValue: "",
      onChangeTarget: "onChange",
      onChangeValue: "noop",
      directionTarget: "direction",
      directionValue: "column",
      groupNameTarget: "groupName",
      groupNameSource: "content.title",
    },
    optionProps: { valueTarget: "value", valueSource: "option.id" },
    provenance: { kind: "test", source: "fixture" },
  };
  const componentIds = [
    "base.Group",
    "base.Option",
    "base.Layout",
    "base.Title",
    "base.Description",
    "asset.Leading",
    "asset.Trailing",
  ];
  const bindings = componentIds.map(binding);
  return {
    node: choicePanelNode(),
    resolution: {
      manifestNodeId: "choice-panel",
      semanticRole: "choicePanel",
      confidence: 1,
      evidence: [],
      diagnosticCodes: [],
      decision: "compose",
      bindings,
      props: {},
    } satisfies Extract<ResolutionNode, { decision: "compose" }>,
    recipe,
    localNames: new Map(
      componentIds.map((componentId) => [
        componentId,
        componentId.split(".").at(-1)!.replace("Group", "SelectionGroup"),
      ]),
    ),
  };
}

function choicePanelNode(): UiNodeV2 {
  const option = (id: string, info = false) => ({
    id,
    sourceNodeIds: [`source-${id}`],
    label: id.toUpperCase(),
    labelSourceNodeId: `source-${id}`,
    ...(info
      ? {
          info: {
            present: true as const,
            hint: "information",
            sourceNodeId: `source-${id}`,
          },
        }
      : {}),
    selected: false,
  });
  return {
    id: "choice-panel",
    kind: "control",
    role: "choicePanel",
    sourceNodeIds: [
      "source-root",
      "source-one",
      "source-two",
      "source-three",
      "source-four",
      "source-five",
    ],
    layoutSourceNodeId: "source-root",
    confidence: 1,
    evidence: [],
    content: {
      title: "Choose",
      titleSourceNodeId: "source-root",
      headerIcon: { hint: "files", sourceNodeId: "source-root" },
      sections: [
        { id: "first", options: [option("one", true), option("two")] },
        {
          id: "second",
          label: "More",
          labelSourceNodeId: "source-root",
          options: [option("three"), option("four"), option("five")],
        },
      ],
    },
    state: { selectionMode: "single", selectedOptionId: null },
    children: [],
  };
}

function binding(componentId: string): ComponentBinding {
  return {
    componentId,
    package: "@test/ui",
    export: componentId.split(".").at(-1)!,
    exportKind: "named",
  };
}
