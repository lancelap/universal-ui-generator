import type { ReactRenderRecipes, ResolutionNode } from "@uig/contracts";
import { sha256 } from "@uig/design-context";

import { ReactGenerationError } from "./errors.js";
import type {
  ReactImportModel,
  ReactNamedImportSpecifierModel,
} from "./generation-model.js";

interface ResolvedBinding {
  componentId: string;
  package: string;
  export: string;
  exportKind: "named" | "default";
}

export function buildImportModel(
  resolutions: ResolutionNode[],
  recipes: ReactRenderRecipes,
): ReactImportModel[] {
  const recipesByComponentId = new Map(
    recipes.components.map((recipe) => [recipe.componentId, recipe]),
  );
  const bindings = uniqueBindings(resolutions);
  for (const binding of bindings) {
    if (!recipesByComponentId.has(binding.componentId)) {
      throw new ReactGenerationError(
        "GENERATION_INPUT_INVALID",
        `Resolved binding ${binding.componentId} has no render recipe`,
      );
    }
  }

  const localNames = assignLocalNames(bindings);
  const result: ReactImportModel[] = [];
  let named:
    | { package: string; specifiers: ReactNamedImportSpecifierModel[] }
    | undefined;

  for (const binding of bindings) {
    const local = localNames.get(bindingKey(binding))!;
    if (binding.exportKind === "default") {
      named = undefined;
      result.push({
        kind: "default",
        package: binding.package,
        componentId: binding.componentId,
        imported: binding.export,
        local,
      });
      continue;
    }

    if (!named || named.package !== binding.package) {
      named = { package: binding.package, specifiers: [] };
      result.push({
        kind: "named",
        package: named.package,
        specifiers: named.specifiers,
      });
    }
    named.specifiers.push({
      componentId: binding.componentId,
      imported: binding.export,
      local,
    });
  }

  return result;
}

function uniqueBindings(resolutions: ResolutionNode[]): ResolvedBinding[] {
  const unique = new Map<string, ResolvedBinding>();
  for (const resolution of resolutions) {
    const bindings =
      resolution.decision === "reuse"
        ? [resolution.binding]
        : resolution.decision === "compose"
          ? resolution.bindings
          : [];
    for (const binding of bindings) {
      unique.set(bindingKey(binding), binding);
    }
  }
  return [...unique.values()].sort(compareBindings);
}

function assignLocalNames(
  bindings: ResolvedBinding[],
): ReadonlyMap<string, string> {
  const exportCounts = count(bindings.map((binding) => binding.export));
  const candidates = bindings.map((binding) => ({
    binding,
    candidate:
      (exportCounts.get(binding.export) ?? 0) === 1
        ? binding.export
        : pascal(binding.componentId),
  }));
  const candidateCounts = count(candidates.map(({ candidate }) => candidate));
  return new Map(
    candidates.map(({ binding, candidate }) => [
      bindingKey(binding),
      (candidateCounts.get(candidate) ?? 0) === 1
        ? candidate
        : `${candidate}${sha256(bindingKey(binding)).slice(0, 6)}`,
    ]),
  );
}

function count(values: string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function compareBindings(
  left: ResolvedBinding,
  right: ResolvedBinding,
): number {
  return (
    left.package.localeCompare(right.package) ||
    left.exportKind.localeCompare(right.exportKind) ||
    left.export.localeCompare(right.export) ||
    left.componentId.localeCompare(right.componentId)
  );
}

function bindingKey(binding: ResolvedBinding): string {
  return [
    binding.package,
    binding.export,
    binding.exportKind,
    binding.componentId,
  ].join("\u0000");
}

function pascal(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
}
