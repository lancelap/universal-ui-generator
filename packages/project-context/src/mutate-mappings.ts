import type { ProjectComponentMappingsV1 } from "@uig/contracts";

import { ProjectContextError } from "./errors.js";

export interface ProjectComponentMappingChange {
  componentId: string;
  semanticRoles: readonly string[];
  capabilities: readonly string[];
  formAdapters: readonly string[];
}

export function applyMappingChanges(input: {
  current: ProjectComponentMappingsV1;
  changes: readonly ProjectComponentMappingChange[];
  operation: "confirm" | "remove";
}): ProjectComponentMappingsV1 {
  const seen = new Set<string>();
  const entries = new Map(
    input.current.components.map((entry) => [
      entry.componentId,
      structuredClone(entry),
    ]),
  );
  for (const change of input.changes) {
    if (seen.has(change.componentId)) {
      throw new ProjectContextError(
        "DUPLICATE_COMPONENT_ID",
        `Duplicate mapping change: ${change.componentId}`,
      );
    }
    seen.add(change.componentId);
    if (input.operation === "confirm") {
      entries.set(change.componentId, {
        componentId: change.componentId,
        semanticRoles: unique(change.semanticRoles),
        capabilities: unique(change.capabilities),
        formAdapters: unique(change.formAdapters),
        status: "mapped",
      });
      continue;
    }
    const existing = entries.get(change.componentId);
    if (!existing) continue;
    const next = {
      ...existing,
      semanticRoles: existing.semanticRoles.filter(
        (value) => !change.semanticRoles.includes(value),
      ),
      capabilities: existing.capabilities.filter(
        (value) => !change.capabilities.includes(value),
      ),
      formAdapters: existing.formAdapters.filter(
        (value) => !change.formAdapters.includes(value),
      ),
    };
    if (
      next.semanticRoles.length === 0 &&
      next.capabilities.length === 0 &&
      next.formAdapters.length === 0
    ) {
      entries.delete(change.componentId);
    } else {
      entries.set(change.componentId, next);
    }
  }
  return {
    schema: "project-component-mappings/v1",
    components: [...entries.values()].sort((a, b) =>
      a.componentId.localeCompare(b.componentId),
    ),
    designComponents: structuredClone(input.current.designComponents),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
