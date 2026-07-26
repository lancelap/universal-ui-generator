import type { ComponentCatalogEntry, CompositionRules } from "@uig/contracts";

import { DesignSystemPackError } from "./errors.js";

export function validateCompositions(input: {
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
  compositionRules: CompositionRules;
}): void {
  for (const component of input.componentsById.values()) {
    for (const referencedId of [
      ...component.requiredComponentIds,
      ...component.optionalComponentIds,
    ]) {
      if (!input.componentsById.has(referencedId)) {
        throw new DesignSystemPackError(
          "RULE_REFERENCE_MISSING",
          `Component ${component.id} references missing companion ${referencedId}`,
        );
      }
    }
  }

  const ruleIds = new Set<string>();
  for (const rule of input.compositionRules.rules) {
    if (ruleIds.has(rule.id)) {
      throw new DesignSystemPackError(
        "DESIGN_SYSTEM_PACK_INVALID",
        `Duplicate composition rule ID: ${rule.id}`,
      );
    }
    ruleIds.add(rule.id);
    if (!input.componentsById.has(rule.rootComponentId)) {
      throw new DesignSystemPackError(
        "RULE_REFERENCE_MISSING",
        `Composition ${rule.id} has an unknown root component`,
      );
    }
    for (const componentId of Object.values(rule.slots)) {
      if (!input.componentsById.has(componentId)) {
        throw new DesignSystemPackError(
          "RULE_REFERENCE_MISSING",
          `Composition ${rule.id} references unknown slot component ${componentId}`,
        );
      }
    }
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (componentId: string): void => {
    if (active.has(componentId)) {
      throw new DesignSystemPackError(
        "COMPOSITION_CYCLE_DETECTED",
        `Required-component cycle contains ${componentId}`,
      );
    }
    if (visited.has(componentId)) {
      return;
    }
    active.add(componentId);
    const component = input.componentsById.get(componentId);
    component?.requiredComponentIds.forEach(visit);
    active.delete(componentId);
    visited.add(componentId);
  };
  input.componentsById.forEach((_component, id) => visit(id));
}
