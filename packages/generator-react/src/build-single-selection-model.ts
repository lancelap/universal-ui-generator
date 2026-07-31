import type {
  ChoicePanelContent,
  ChoicePanelState,
  ReactSingleSelectionCollectionRecipe,
  ResolutionNode,
  UiNodeV2,
} from "@uig/contracts";

import { ReactGenerationError } from "./errors.js";
import type { ReactSingleSelectionCollectionElementModel } from "./generation-model.js";

export function buildSingleSelectionModel(input: {
  node: UiNodeV2;
  resolution: Extract<ResolutionNode, { decision: "compose" }>;
  recipe: ReactSingleSelectionCollectionRecipe;
  localNames: ReadonlyMap<string, string>;
}): ReactSingleSelectionCollectionElementModel {
  if (input.node.role !== input.recipe.semanticRole) {
    invalid("Structured recipe role does not match the manifest node");
  }
  const content = input.node.content as ChoicePanelContent | undefined;
  const state = input.node.state as ChoicePanelState | undefined;
  if (!content || !state || state.selectionMode !== "single") {
    invalid("Choice panel content or state is incomplete");
  }

  const requiredIds = [
    input.recipe.rootComponentId,
    input.recipe.optionComponentId,
    input.recipe.layoutComponentId,
    input.recipe.titleComponentId,
    input.recipe.descriptionComponentId,
  ];
  const resolvedIds = new Set(
    input.resolution.bindings.map((binding) => binding.componentId),
  );
  for (const componentId of requiredIds) {
    if (!resolvedIds.has(componentId) || !input.localNames.has(componentId)) {
      invalid(`Required structured binding ${componentId} is unavailable`);
    }
  }

  const optionalLocalName = (componentId: string | undefined) =>
    componentId && resolvedIds.has(componentId)
      ? input.localNames.get(componentId)
      : undefined;
  const leadingAssetLocalName = optionalLocalName(
    input.recipe.leadingAssetComponentId,
  );
  const trailingAssetLocalName = optionalLocalName(
    input.recipe.trailingAssetComponentId,
  );
  const rootProps = [
    {
      name: input.recipe.rootProps.valueTarget,
      value: {
        kind: "literal" as const,
        value: state.selectedOptionId ?? input.recipe.rootProps.emptyValue,
      },
    },
    {
      name: input.recipe.rootProps.onChangeTarget,
      value: { kind: "noop" as const },
    },
    {
      name: input.recipe.rootProps.directionTarget,
      value: {
        kind: "literal" as const,
        value: input.recipe.rootProps.directionValue,
      },
    },
    {
      name: input.recipe.rootProps.groupNameTarget,
      value: { kind: "literal" as const, value: content.title },
    },
  ];

  return {
    kind: "single-selection-collection",
    nodeId: input.node.id,
    sourceNodeIds: input.node.sourceNodeIds,
    rootComponentId: input.recipe.rootComponentId,
    rootLocalName: input.localNames.get(input.recipe.rootComponentId)!,
    localName: input.localNames.get(input.recipe.rootComponentId)!,
    props: rootProps,
    optionComponentId: input.recipe.optionComponentId,
    optionLocalName: input.localNames.get(input.recipe.optionComponentId)!,
    layoutComponentId: input.recipe.layoutComponentId,
    layoutLocalName: input.localNames.get(input.recipe.layoutComponentId)!,
    titleComponentId: input.recipe.titleComponentId,
    titleLocalName: input.localNames.get(input.recipe.titleComponentId)!,
    descriptionComponentId: input.recipe.descriptionComponentId,
    descriptionLocalName: input.localNames.get(
      input.recipe.descriptionComponentId,
    )!,
    ...(leadingAssetLocalName ? { leadingAssetLocalName } : {}),
    ...(trailingAssetLocalName ? { trailingAssetLocalName } : {}),
    title: content.title,
    rootProps,
    sections: content.sections.map((section) => ({
      id: section.id,
      ...(section.label ? { label: section.label } : {}),
      options: section.options.map((option) => ({
        id: option.id,
        sourceNodeIds: option.sourceNodeIds,
        label: option.label,
        ...(option.description ? { description: option.description } : {}),
        hasTrailingAsset:
          option.info?.present === true &&
          optionalLocalName(input.recipe.trailingAssetComponentId) !==
            undefined,
        props: [
          {
            name: input.recipe.optionProps.valueTarget,
            value: { kind: "literal", value: option.id },
          },
        ],
      })),
    })),
    classNames: {
      root: "choicePanel",
      header: "choicePanelHeader",
      section: "choiceSection",
      sectionLabel: "choiceSectionLabel",
      optionRow: "choiceOptionRow",
      optionContent: "choiceOptionContent",
      description: "choiceDescription",
      trailingAsset: "choiceTrailingAsset",
    },
    children: [],
  };
}

function invalid(message: string): never {
  throw new ReactGenerationError("GENERATION_INPUT_INVALID", message);
}
