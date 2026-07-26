import type { UiNodeV2 } from "@uig/contracts";

import { SemanticPlannerError } from "./exact-component-recognizer.js";

export function attachActivateInteractions(root: UiNodeV2): void {
  const normalizedRoles = new Map<string, string>();
  const counts = new Map<string, number>();

  visit(root, (node) => {
    if (node.kind !== "action" || node.evidence.length === 0) {
      return;
    }
    const baseKey = normalizeInteractionKey(node.role);
    const existingRole = normalizedRoles.get(baseKey);
    if (existingRole !== undefined && existingRole !== node.role) {
      throw new SemanticPlannerError(
        "SEMANTIC_INTERACTION_CONFLICT",
        `Semantic roles ${existingRole} and ${node.role} normalize to ${baseKey}`,
      );
    }
    normalizedRoles.set(baseKey, node.role);
    const count = (counts.get(baseKey) ?? 0) + 1;
    counts.set(baseKey, count);
    node.interactions = [
      {
        key: count === 1 ? baseKey : `${baseKey}${count}`,
        event: "activate",
        valueType: "void",
      },
    ];
  });
}

function visit(node: UiNodeV2, callback: (node: UiNodeV2) => void): void {
  callback(node);
  node.children.forEach((child) => visit(child, callback));
}

function normalizeInteractionKey(role: string): string {
  const parts = role.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) {
    return "interaction";
  }
  return parts
    .map((part, index) =>
      index === 0
        ? `${part[0]!.toLowerCase()}${part.slice(1)}`
        : `${part[0]!.toUpperCase()}${part.slice(1)}`,
    )
    .join("");
}
