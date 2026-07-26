import type { ComponentCatalogEntry, SemanticPolicy } from "@uig/contracts";

import { DesignSystemPackError } from "./errors.js";

export function buildCatalogIndexes(
  components: readonly ComponentCatalogEntry[],
  policy: SemanticPolicy,
): {
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
  candidatesByRole: ReadonlyMap<string, readonly ComponentCatalogEntry[]>;
} {
  const componentsById = new Map<string, ComponentCatalogEntry>();
  for (const component of components) {
    if (componentsById.has(component.id)) {
      throw new DesignSystemPackError(
        "COMPONENT_CATALOG_ENTRY_INVALID",
        `Duplicate component ID: ${component.id}`,
      );
    }
    componentsById.set(component.id, component);
  }

  const candidatesByRole = new Map<string, readonly ComponentCatalogEntry[]>();
  for (const [role, rolePolicy] of Object.entries(policy.roles)) {
    const candidates = rolePolicy.candidateComponentIds.map((componentId) => {
      const component = componentsById.get(componentId);
      if (!component) {
        throw new DesignSystemPackError(
          "RULE_REFERENCE_MISSING",
          `Role ${role} references unknown component ${componentId}`,
        );
      }
      if (!component.semanticRoles.includes(role)) {
        throw new DesignSystemPackError(
          "COMPONENT_CATALOG_ENTRY_INVALID",
          `Component ${componentId} does not declare semantic role ${role}`,
        );
      }
      return component;
    });
    candidates.sort(
      (left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id),
    );
    if (
      candidates.length > 1 &&
      candidates[0]?.priority === candidates[1]?.priority
    ) {
      throw new DesignSystemPackError(
        "COMPONENT_CATALOG_ENTRY_INVALID",
        `Role ${role} has equal highest-priority candidates`,
      );
    }
    candidatesByRole.set(role, candidates);
  }

  return { componentsById, candidatesByRole };
}
