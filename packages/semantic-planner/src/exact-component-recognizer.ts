import type { DesignNode, PixsoSemanticMapping } from "@uig/contracts";

import type { SemanticRecognition } from "./evidence.js";

export class SemanticPlannerError extends Error {
  readonly name = "SemanticPlannerError";

  constructor(
    readonly code:
      "SEMANTIC_MAPPING_CONFLICT" | "SEMANTIC_INTERACTION_CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export interface ExactComponentRecognizer {
  recognize(node: DesignNode): SemanticRecognition | undefined;
}

export function createExactComponentRecognizer(
  mappings: readonly PixsoSemanticMapping[],
): ExactComponentRecognizer {
  const byKey = new Map<string, PixsoSemanticMapping[]>();
  const unique = new Set<string>();

  for (const mapping of mappings) {
    const identity = `${mapping.componentKey}\u0000${mapping.variant ?? ""}`;
    if (unique.has(identity)) {
      throw new SemanticPlannerError(
        "SEMANTIC_MAPPING_CONFLICT",
        `Duplicate Pixso semantic mapping for ${mapping.componentKey}`,
      );
    }
    unique.add(identity);
    const current = byKey.get(mapping.componentKey) ?? [];
    current.push(mapping);
    byKey.set(mapping.componentKey, current);
  }

  return {
    recognize(node) {
      if (!node.component) {
        return undefined;
      }
      const candidates = byKey.get(node.component.key) ?? [];
      const selected =
        candidates.find(
          (mapping) =>
            mapping.variant !== undefined &&
            mapping.variant === node.component?.variant,
        ) ?? candidates.find((mapping) => mapping.variant === undefined);
      if (!selected) {
        return undefined;
      }

      return {
        kind: selected.kind,
        role: selected.role,
        confidence: 1,
        evidence: [
          { kind: "component-key", value: node.component.key, weight: 1 },
          ...(selected.variant
            ? [
                {
                  kind: "component-variant",
                  value: selected.variant,
                  weight: 1,
                } as const,
              ]
            : []),
          { kind: "source-node", value: node.id },
        ],
        sourceNodeIds: [node.id],
      };
    },
  };
}
