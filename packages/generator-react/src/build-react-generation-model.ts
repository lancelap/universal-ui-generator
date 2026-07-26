import type {
  Diagnostic,
  ReactComponentRecipe,
  ReactStylePolicy,
  RenderOnlyPropReport,
  ResolutionNode,
  UiNodeV2,
} from "@uig/contracts";

import { buildImportModel } from "./build-import-model.js";
import { buildPropsModel } from "./build-props-model.js";
import { ReactGenerationError } from "./errors.js";
import type {
  GeneratedPropModel,
  ReactElementModel,
  ReactGenerationModel,
  ReactImportModel,
  ReadyGenerationInput,
} from "./generation-model.js";
import { placeCompositionSlots } from "./place-composition-slots.js";

export function buildReactGenerationModel(
  input: ReadyGenerationInput,
): ReactGenerationModel {
  const imports = buildImportModel(
    input.resolutionPlan.nodes,
    input.pack.reactRenderRecipes,
  );
  const localNames = indexLocalNames(imports);
  const recipesByComponentId = new Map(
    input.pack.reactRenderRecipes.components.map((recipe) => [
      recipe.componentId,
      recipe,
    ]),
  );
  const externalProps = new Map<string, GeneratedPropModel>();
  const renderOnlyProps: RenderOnlyPropReport[] = [];
  const diagnostics: Diagnostic[] = [];

  const lower = (node: UiNodeV2): ReactElementModel => {
    const resolution = input.resolutionsByManifestNodeId.get(node.id);
    if (!resolution || resolution.decision === "blocked") {
      throw new ReactGenerationError(
        "GENERATION_INPUT_INVALID",
        `Node ${node.id} has no usable resolution`,
      );
    }

    if (resolution.decision === "fallback") {
      return {
        kind: "fallback",
        nodeId: node.id,
        sourceNodeIds: node.sourceNodeIds,
        localComponentName: resolution.localComponentName,
        children: node.children.map(lower),
      };
    }

    const rootBinding =
      resolution.decision === "reuse"
        ? resolution.binding
        : findCompositionRoot(input, resolution);
    const recipe = recipesByComponentId.get(rootBinding.componentId);
    if (!recipe) {
      throw new ReactGenerationError(
        "GENERATION_RECIPE_MISSING",
        `No render recipe exists for ${rootBinding.componentId}`,
      );
    }
    const childrenPolicyDiagnostic = evaluateChildrenPolicy(node, recipe);
    if (childrenPolicyDiagnostic) {
      diagnostics.push(childrenPolicyDiagnostic);
    }
    const props = buildPropsModel(node, resolution, recipe);
    mergeExternalProps(externalProps, props.externalProps);
    if (props.renderOnlyPropNames.length > 0) {
      renderOnlyProps.push({
        manifestNodeId: node.id,
        componentId: rootBinding.componentId,
        propNames: props.renderOnlyPropNames,
      });
    }

    let element: ReactElementModel;
    if (resolution.decision === "reuse") {
      element = {
        kind: "reuse",
        nodeId: node.id,
        sourceNodeIds: node.sourceNodeIds,
        componentId: rootBinding.componentId,
        localName: requireLocalName(localNames, rootBinding.componentId),
        props: props.elementProps,
        ...(props.textChild ? { textChild: props.textChild } : {}),
        children: node.children.map(lower),
      };
    } else {
      const composition = input.pack.reactRenderRecipes.compositions.find(
        (candidate) => candidate.rootComponentId === rootBinding.componentId,
      );
      if (!composition) {
        throw new ReactGenerationError(
          "GENERATION_RECIPE_MISSING",
          `No composition recipe exists for ${rootBinding.componentId}`,
        );
      }
      const placed = placeCompositionSlots({
        children: node.children,
        recipe: composition,
      });
      const slots = placed.slots.map((slot) => {
        if (!recipesByComponentId.has(slot.componentId)) {
          throw new ReactGenerationError(
            "GENERATION_RECIPE_MISSING",
            `No render recipe exists for slot ${slot.componentId}`,
          );
        }
        return {
          name: slot.name,
          componentId: slot.componentId,
          localName: requireLocalName(localNames, slot.componentId),
          children: slot.children.map(lower),
        };
      });
      element = {
        kind: "compose",
        nodeId: node.id,
        sourceNodeIds: node.sourceNodeIds,
        componentId: rootBinding.componentId,
        localName: requireLocalName(localNames, rootBinding.componentId),
        props: props.elementProps,
        ...(props.textChild ? { textChild: props.textChild } : {}),
        slots,
        children: slots.flatMap((slot) => slot.children),
      };
    }

    return maybeWrap(input, node, recipe, rootBinding.componentId, element);
  };

  const root = lower(input.uiManifest.root);
  return {
    imports,
    externalProps: [...externalProps.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    renderOnlyProps: renderOnlyProps.sort(
      (left, right) =>
        left.manifestNodeId.localeCompare(right.manifestNodeId) ||
        left.componentId.localeCompare(right.componentId),
    ),
    diagnostics: diagnostics.sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        String(left.evidence?.manifestNodeId ?? "").localeCompare(
          String(right.evidence?.manifestNodeId ?? ""),
        ),
    ),
    root,
  };
}

function findCompositionRoot(
  input: ReadyGenerationInput,
  resolution: Extract<ResolutionNode, { decision: "compose" }>,
) {
  const rootIds = new Set(
    input.pack.reactRenderRecipes.compositions.map(
      (composition) => composition.rootComponentId,
    ),
  );
  const matches = resolution.bindings.filter((binding) =>
    rootIds.has(binding.componentId),
  );
  if (matches.length !== 1) {
    throw new ReactGenerationError(
      "GENERATION_COMPOSITION_AMBIGUOUS",
      `Resolution ${resolution.manifestNodeId} has ${matches.length} composition roots`,
    );
  }
  return matches[0]!;
}

function evaluateChildrenPolicy(
  node: UiNodeV2,
  recipe: ReactComponentRecipe,
): Diagnostic | undefined {
  if (
    (recipe.semanticChildrenPolicy === "required" &&
      node.children.length === 0) ||
    (recipe.semanticChildrenPolicy === "forbidden" && node.children.length > 0)
  ) {
    throw new ReactGenerationError(
      "GENERATION_INPUT_INCOMPLETE",
      `Node ${node.id} violates the ${recipe.semanticChildrenPolicy} semantic children policy`,
    );
  }
  if (
    recipe.semanticChildrenPolicy === "render-only-optional" &&
    node.children.length === 0
  ) {
    return {
      severity: "warning",
      blocking: false,
      stage: "react-generation",
      code: "GENERATION_RENDER_ONLY_CHILDREN_MISSING",
      message: "Render-only structural group has no semantic children",
      evidence: {
        manifestNodeId: node.id,
        semanticRole: node.role,
      },
    };
  }
  return undefined;
}

function maybeWrap(
  input: ReadyGenerationInput,
  node: UiNodeV2,
  recipe: ReactComponentRecipe,
  componentId: string,
  element: ReactElementModel,
): ReactElementModel {
  const designNode = input.designIr.nodes[node.layoutSourceNodeId];
  const needsStyleHook =
    designNode?.layout !== undefined || designNode?.position !== undefined;
  const stylePolicy = componentStylePolicy(
    input.pack.reactStylePolicy,
    componentId,
  );
  if (
    needsStyleHook &&
    !recipe.classNameProp &&
    recipe.wrapper === "allowed" &&
    stylePolicy?.wrapper === "allowed"
  ) {
    return {
      kind: "intrinsic-wrapper",
      nodeId: node.id,
      sourceNodeIds: node.sourceNodeIds,
      tag: "div",
      className: cssIdentifier(node.id),
      children: [element],
    };
  }
  return element;
}

function componentStylePolicy(policy: ReactStylePolicy, componentId: string) {
  return policy.components.find(
    (component) => component.componentId === componentId,
  );
}

function indexLocalNames(
  imports: ReactImportModel[],
): ReadonlyMap<string, string> {
  return new Map(
    imports.flatMap((item) =>
      item.kind === "default"
        ? [[item.componentId, item.local] as const]
        : item.specifiers.map(
            (specifier) => [specifier.componentId, specifier.local] as const,
          ),
    ),
  );
}

function requireLocalName(
  names: ReadonlyMap<string, string>,
  componentId: string,
): string {
  const name = names.get(componentId);
  if (!name) {
    throw new ReactGenerationError(
      "GENERATION_IMPORT_CONFLICT",
      `No import name exists for ${componentId}`,
    );
  }
  return name;
}

function mergeExternalProps(
  target: Map<string, GeneratedPropModel>,
  incoming: GeneratedPropModel[],
): void {
  for (const prop of incoming) {
    const existing = target.get(prop.name);
    if (existing && existing.type !== prop.type) {
      throw new ReactGenerationError(
        "GENERATION_PROP_CONFLICT",
        `Generated prop ${prop.name} has incompatible types`,
      );
    }
    target.set(prop.name, existing ?? prop);
  }
}

function cssIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "_");
}
