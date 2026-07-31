import type {
  ComponentCatalogEntry,
  CompositionRules,
  ReactComponentRecipeV2,
  ReactRenderRecipesV2,
  ReactStylePolicy,
  SemanticPolicy,
} from "@uig/contracts";

import { DesignSystemPackError } from "./errors.js";

export function validateReactRecipes(input: {
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
  semanticPolicy: SemanticPolicy;
  compositionRules: CompositionRules;
  reactRenderRecipes: ReactRenderRecipesV2;
  reactStylePolicy: ReactStylePolicy;
}): void {
  const recipesByComponentId = indexComponentRecipes(
    input.reactRenderRecipes.components,
    input.componentsById,
  );
  validateSingleSelectionCollections(input, recipesByComponentId);
  validateRecipeCoverage(input, recipesByComponentId);
  validatePropTargets(input.reactRenderRecipes.components);
  validateCompositionRecipes(input);
  validateStylePolicy(input);
}

function validateSingleSelectionCollections(
  input: {
    componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
    reactRenderRecipes: ReactRenderRecipesV2;
  },
  recipesByComponentId: ReadonlyMap<string, ReactComponentRecipeV2>,
): void {
  const roles = new Set<string>();
  for (const recipe of input.reactRenderRecipes.singleSelectionCollections ??
    []) {
    if (roles.has(recipe.semanticRole)) {
      structuredRecipeError(
        `Duplicate structured recipe for ${recipe.semanticRole}`,
      );
    }
    roles.add(recipe.semanticRole);

    if (recipe.rootComponentId === recipe.optionComponentId) {
      structuredRecipeError(
        `Structured recipe ${recipe.semanticRole} uses one component as both root and option`,
      );
    }

    const componentIds = [
      recipe.rootComponentId,
      recipe.optionComponentId,
      recipe.layoutComponentId,
      recipe.titleComponentId,
      recipe.descriptionComponentId,
      ...(recipe.leadingAssetComponentId
        ? [recipe.leadingAssetComponentId]
        : []),
      ...(recipe.trailingAssetComponentId
        ? [recipe.trailingAssetComponentId]
        : []),
    ];
    for (const componentId of componentIds) {
      if (!input.componentsById.has(componentId)) {
        structuredRecipeError(
          `Structured recipe ${recipe.semanticRole} references unknown component ${componentId}`,
        );
      }
      if (!recipesByComponentId.has(componentId)) {
        structuredRecipeError(
          `Structured recipe ${recipe.semanticRole} component ${componentId} has no scalar render recipe`,
        );
      }
    }

    const rootTargets = [
      recipe.rootProps.valueTarget,
      recipe.rootProps.onChangeTarget,
      recipe.rootProps.directionTarget,
      recipe.rootProps.groupNameTarget,
    ];
    if (new Set(rootTargets).size !== rootTargets.length) {
      structuredRecipeError(
        `Structured recipe ${recipe.semanticRole} maps multiple root values to one prop`,
      );
    }
  }
}

function indexComponentRecipes(
  recipes: ReactComponentRecipeV2[],
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>,
): ReadonlyMap<string, ReactComponentRecipeV2> {
  const indexed = new Map<string, ReactComponentRecipeV2>();
  for (const recipe of recipes) {
    if (!componentsById.has(recipe.componentId)) {
      throw new DesignSystemPackError(
        "REACT_RECIPE_COMPONENT_MISSING",
        `React recipe references unknown component ${recipe.componentId}`,
      );
    }
    if (indexed.has(recipe.componentId)) {
      throw new DesignSystemPackError(
        "DESIGN_SYSTEM_PACK_INVALID",
        `Duplicate React recipe for ${recipe.componentId}`,
      );
    }
    indexed.set(recipe.componentId, recipe);
  }
  return indexed;
}

function validateRecipeCoverage(
  input: {
    componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
    semanticPolicy: SemanticPolicy;
    compositionRules: CompositionRules;
  },
  recipesByComponentId: ReadonlyMap<string, ReactComponentRecipeV2>,
): void {
  const requiredIds = new Set<string>();
  const addClosure = (componentId: string): void => {
    if (requiredIds.has(componentId)) {
      return;
    }
    requiredIds.add(componentId);
    const component = input.componentsById.get(componentId);
    component?.requiredComponentIds.forEach(addClosure);
  };

  for (const [role, policy] of Object.entries(input.semanticPolicy.roles)) {
    if (
      policy.allowedDecisions.includes("reuse") ||
      policy.allowedDecisions.includes("compose")
    ) {
      policy.candidateComponentIds.forEach(addClosure);
    }
    if (policy.allowedDecisions.includes("compose")) {
      for (const rule of input.compositionRules.rules) {
        if (rule.semanticRole !== role) {
          continue;
        }
        addClosure(rule.rootComponentId);
        Object.values(rule.slots).forEach(addClosure);
      }
    }
  }

  for (const componentId of requiredIds) {
    const component = input.componentsById.get(componentId);
    if (component?.verified && !recipesByComponentId.has(componentId)) {
      throw new DesignSystemPackError(
        "REACT_RECIPE_COMPONENT_UNCOVERED",
        `Verified React component ${componentId} has no render recipe`,
      );
    }
  }
}

function validatePropTargets(recipes: ReactComponentRecipeV2[]): void {
  for (const recipe of recipes) {
    const targets = [
      ...recipe.stateProps.map((mapping) => mapping.target),
      ...recipe.eventProps.map((mapping) => mapping.target),
      ...(recipe.classNameProp ? [recipe.classNameProp] : []),
    ];
    if (new Set(targets).size !== targets.length) {
      recipeConflict(recipe.componentId, "maps multiple sources to one prop");
    }
    if (recipe.content && targets.includes(recipe.content.target)) {
      const optionalStateFallback =
        recipe.content.required === false &&
        recipe.stateProps.some(
          (mapping) => mapping.target === recipe.content!.target,
        ) &&
        !recipe.eventProps.some(
          (mapping) => mapping.target === recipe.content!.target,
        ) &&
        recipe.classNameProp !== recipe.content.target;
      if (!optionalStateFallback) {
        recipeConflict(recipe.componentId, "maps multiple sources to one prop");
      }
    }

    const staticTargets = recipe.staticProps.map((prop) => prop.target);
    if (new Set(staticTargets).size !== staticTargets.length) {
      recipeConflict(recipe.componentId, "duplicate static prop target");
    }

    const eventTargets = new Set(recipe.eventProps.map((prop) => prop.target));
    for (const prop of recipe.staticProps) {
      if (prop.value.kind === "noop" && !eventTargets.has(prop.target)) {
        recipeConflict(
          recipe.componentId,
          `noop target ${prop.target} is not an event`,
        );
      }
    }
  }
}

function validateCompositionRecipes(input: {
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
  compositionRules: CompositionRules;
  reactRenderRecipes: ReactRenderRecipesV2;
}): void {
  const rulesById = new Map(
    input.compositionRules.rules.map((rule) => [rule.id, rule]),
  );
  const recipeIds = new Set<string>();

  for (const recipe of input.reactRenderRecipes.compositions) {
    if (recipeIds.has(recipe.compositionId)) {
      compositionError(`Duplicate recipe ${recipe.compositionId}`);
    }
    recipeIds.add(recipe.compositionId);
    const rule = rulesById.get(recipe.compositionId);
    if (!rule || rule.rootComponentId !== recipe.rootComponentId) {
      compositionError(
        `Recipe ${recipe.compositionId} does not match its composition rule`,
      );
    }

    const remainingSlots = recipe.slots.filter(
      (slot) => "acceptsRemaining" in slot,
    );
    if (remainingSlots.length > 1) {
      compositionError(
        `Recipe ${recipe.compositionId} has multiple remaining slots`,
      );
    }

    const acceptedRoles = new Set<string>();
    const recipeSlotNames = new Set<string>();
    for (const slot of recipe.slots) {
      if (
        recipeSlotNames.has(slot.name) ||
        rule.slots[slot.name] !== slot.componentId ||
        !input.componentsById.has(slot.componentId)
      ) {
        compositionError(
          `Recipe ${recipe.compositionId} has an invalid slot ${slot.name}`,
        );
      }
      recipeSlotNames.add(slot.name);
      if ("acceptsRoles" in slot) {
        for (const role of slot.acceptsRoles) {
          if (acceptedRoles.has(role)) {
            compositionError(
              `Recipe ${recipe.compositionId} routes role ${role} more than once`,
            );
          }
          acceptedRoles.add(role);
        }
      }
    }

    if (
      recipeSlotNames.size !== Object.keys(rule.slots).length ||
      Object.keys(rule.slots).some((name) => !recipeSlotNames.has(name))
    ) {
      compositionError(
        `Recipe ${recipe.compositionId} does not cover every composition slot`,
      );
    }
  }

  for (const rule of input.compositionRules.rules) {
    if (!recipeIds.has(rule.id)) {
      compositionError(`Composition ${rule.id} has no React recipe`);
    }
  }
}

function validateStylePolicy(input: {
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
  semanticPolicy: SemanticPolicy;
  reactStylePolicy: ReactStylePolicy;
}): void {
  for (const componentPolicy of input.reactStylePolicy.components) {
    if (!input.componentsById.has(componentPolicy.componentId)) {
      throw new DesignSystemPackError(
        "REACT_STYLE_COMPONENT_MISSING",
        `React style policy references unknown component ${componentPolicy.componentId}`,
      );
    }
  }

  const fallbackRequired = Object.values(input.semanticPolicy.roles).some(
    (policy) => policy.allowedDecisions.includes("fallback"),
  );
  if (
    fallbackRequired &&
    (!input.reactStylePolicy.fallback.layout ||
      !input.reactStylePolicy.fallback.appearance)
  ) {
    throw new DesignSystemPackError(
      "DESIGN_SYSTEM_PACK_INVALID",
      "React style policy has no fallback policy",
    );
  }
}

function compositionError(message: string): never {
  throw new DesignSystemPackError("REACT_COMPOSITION_RECIPE_INVALID", message);
}

function recipeConflict(componentId: string, message: string): never {
  throw new DesignSystemPackError(
    "REACT_RECIPE_PROP_CONFLICT",
    `React recipe ${componentId} ${message}`,
  );
}

function structuredRecipeError(message: string): never {
  throw new DesignSystemPackError("REACT_STRUCTURED_RECIPE_INVALID", message);
}
