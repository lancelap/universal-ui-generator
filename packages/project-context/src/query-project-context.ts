import type {
  EffectiveComponentCatalogV1,
  PublicComponentsV1,
} from "@uig/contracts";

import { ProjectContextError } from "./errors.js";

const CATALOG_PATH =
  ".ui-context/generated/effective-component-catalog.json" as const;

const SCORE = {
  exactRole: 1000,
  exactExport: 900,
  exactAlias: 850,
  exportPrefix: 500,
  annotationToken: 300,
  propToken: 200,
} as const;

export interface ProjectComponentSearchResult {
  catalogFingerprint: string;
  catalogPath: typeof CATALOG_PATH;
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  results: Array<{
    componentId: string;
    exportName: string;
    import: EffectiveComponentCatalogV1["components"][number]["import"];
    score: number;
    semantics: EffectiveComponentCatalogV1["components"][number]["semantics"];
  }>;
}

export function searchProjectContextCatalog(
  catalog: EffectiveComponentCatalogV1,
  input: {
    query?: string;
    semanticRole?: string;
    status?: "suggested" | "mapped" | "pack-owned";
    limit?: number;
  },
): ProjectComponentSearchResult {
  const query = input.query?.trim().toLocaleLowerCase("en-US");
  const role = input.semanticRole?.trim();
  if (!query && !role && !input.status) {
    throw new ProjectContextError(
      "PROJECT_COMPONENT_NOT_FOUND",
      "A query, semanticRole, or status filter is required",
    );
  }
  const scored = catalog.components.flatMap((component) => {
    const roleEntries = component.semantics.filter(
      (entry) =>
        (!role || entry.role === role) &&
        (!input.status || entry.status === input.status),
    );
    if ((role || input.status) && roleEntries.length === 0) return [];
    let score = role && roleEntries.length > 0 ? SCORE.exactRole : 0;
    if (query) {
      const exportName = component.import.export.toLocaleLowerCase("en-US");
      if (exportName === query) score = Math.max(score, SCORE.exactExport);
      else if (exportName.startsWith(query))
        score = Math.max(score, SCORE.exportPrefix);
      else if (
        component.annotations.some((value) =>
          value.toLocaleLowerCase("en-US").includes(query),
        )
      ) {
        score = Math.max(score, SCORE.annotationToken);
      } else if (!role && !input.status) {
        return [];
      }
    }
    return [{ component, score }];
  });
  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.component.id.localeCompare(right.component.id),
  );
  const limit = Math.min(50, Math.max(1, input.limit ?? 20));
  const selected = scored.slice(0, limit);
  return {
    catalogFingerprint: catalog.fingerprint.value,
    catalogPath: CATALOG_PATH,
    totalCount: scored.length,
    returnedCount: selected.length,
    truncated: scored.length > selected.length,
    results: selected.map(({ component, score }) => ({
      componentId: component.id,
      exportName: component.import.export,
      import: component.import,
      score,
      semantics: component.semantics,
    })),
  };
}

export function getComponentContractFromCatalog(
  catalog: EffectiveComponentCatalogV1,
  input: { componentId: string },
  publicComponents?: PublicComponentsV1,
) {
  const component = catalog.components.find(
    (entry) => entry.id === input.componentId,
  );
  if (!component) {
    throw new ProjectContextError(
      "PROJECT_COMPONENT_NOT_FOUND",
      `Project component was not found: ${input.componentId}`,
    );
  }
  const contractRef = component.contractRef;
  const verifiedContract =
    contractRef.artifact === "public-components"
      ? publicComponents?.components.find(
          (entry) => entry.id === contractRef.id,
        )
      : undefined;
  return {
    componentId: component.id,
    import: component.import,
    contractRef: component.contractRef,
    semantics: component.semantics,
    capabilities: component.capabilities,
    formAdapters: component.formAdapters,
    annotations: component.annotations,
    restrictions: component.restrictions,
    deprecated: component.deprecated,
    contract: verifiedContract?.contract,
    evidence: verifiedContract?.evidence,
    catalogFingerprint: catalog.fingerprint.value,
    catalogPath: CATALOG_PATH,
  };
}

export function getIconPathsFromCatalog(
  catalog: EffectiveComponentCatalogV1,
  input: { names: readonly string[] },
) {
  if (input.names.length === 0 || input.names.length > 50) {
    throw new ProjectContextError(
      "PROJECT_COMPONENT_NOT_FOUND",
      "Icon names must contain between 1 and 50 entries",
    );
  }
  return {
    catalogFingerprint: catalog.fingerprint.value,
    catalogPath: CATALOG_PATH,
    results: input.names.map((name) => {
      const exact = catalog.icons.filter(
        (icon) => icon.import.export === name || icon.aliases.includes(name),
      );
      if (exact.length === 1) {
        return {
          name,
          status: "resolved" as const,
          import: exact[0]!.import,
          componentId: exact[0]!.id,
        };
      }
      if (exact.length > 1) {
        return {
          name,
          status: "ambiguous" as const,
          candidates: exact.map((icon) => ({
            componentId: icon.id,
            import: icon.import,
          })),
        };
      }
      const normalized = name.toLocaleLowerCase("en-US");
      return {
        name,
        status: "unresolved" as const,
        suggestions: catalog.icons
          .filter((icon) =>
            icon.import.export
              .toLocaleLowerCase("en-US")
              .startsWith(normalized.slice(0, 3)),
          )
          .map((icon) => icon.import.export)
          .slice(0, 5),
      };
    }),
  };
}
