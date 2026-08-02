import type {
  EffectiveCatalogFingerprint,
  EffectiveComponentCatalogV1,
  InstalledPackagesV1,
  ProjectComponentAnnotationsV1,
  ProjectComponentMappingsV1,
  ProjectComponentPoliciesV1,
  PublicComponentsV1,
} from "@uig/contracts";
import { assertEffectiveComponentCatalogV1Integrity } from "@uig/contracts";
import type { LoadedDesignSystemPackV2 } from "@uig/component-catalog";

import { ProjectContextError } from "./errors.js";
import { hashContextValue } from "./fingerprint-context.js";

export function buildEffectiveComponentCatalog(input: {
  fingerprint: EffectiveCatalogFingerprint;
  publicComponents: PublicComponentsV1;
  mappings: ProjectComponentMappingsV1;
  annotations: ProjectComponentAnnotationsV1;
  policies: ProjectComponentPoliciesV1;
  installedPackages: InstalledPackagesV1;
  packs: readonly LoadedDesignSystemPackV2[];
}): EffectiveComponentCatalogV1 {
  const projectById = new Map(
    input.publicComponents.components.map((component) => [
      component.id,
      component,
    ]),
  );
  const roles = new Set<string>();
  const capabilities = new Set<string>();
  const formAdapters = new Set<string>();
  for (const pack of input.packs) {
    for (const role of Object.keys(pack.semanticPolicy.roles)) roles.add(role);
    for (const component of pack.componentsById.values()) {
      component.capabilities.forEach((value) => capabilities.add(value));
      component.formAdapters.forEach((value) => formAdapters.add(value));
    }
  }
  const mappings = new Map(
    input.mappings.components.map((mapping) => [mapping.componentId, mapping]),
  );
  const annotations = new Map(
    input.annotations.components.map((annotation) => [
      annotation.componentId,
      annotation,
    ]),
  );
  for (const mapping of input.mappings.components) {
    if (!projectById.has(mapping.componentId))
      fail("MAPPING_TARGET_NOT_FOUND", mapping.componentId);
    mapping.semanticRoles.forEach((role) => {
      if (!roles.has(role)) fail("SEMANTIC_ROLE_UNKNOWN", role);
    });
    mapping.capabilities.forEach((value) => {
      if (!capabilities.has(value)) fail("COMPONENT_CAPABILITY_UNKNOWN", value);
    });
    mapping.formAdapters.forEach((value) => {
      if (!formAdapters.has(value)) fail("FORM_ADAPTER_UNKNOWN", value);
    });
  }
  for (const annotation of input.annotations.components) {
    if (!projectById.has(annotation.componentId))
      fail("MAPPING_TARGET_NOT_FOUND", annotation.componentId);
  }

  const excluded = new Set(input.policies.components.excluded);
  const components: EffectiveComponentCatalogV1["components"] = [];
  for (const component of input.publicComponents.components) {
    if (excluded.has(component.id)) continue;
    const mapping = mappings.get(component.id);
    const annotation = annotations.get(component.id);
    const mappedRoles = new Set(mapping?.semanticRoles ?? []);
    const semantics = [
      ...component.semantics
        .filter((entry) => !mappedRoles.has(entry.role))
        .map((entry) => ({
          role: entry.role,
          status: "suggested" as const,
          confidence: entry.confidence,
          source: ".ui-context/generated/public-components.json",
        })),
      ...(mapping?.semanticRoles ?? []).map((role) => ({
        role,
        status: "mapped" as const,
        confidence: 1,
        source: ".ui-context/mappings.json",
      })),
    ].sort((a, b) => a.role.localeCompare(b.role));
    components.push({
      id: component.id,
      availability: "verified",
      import: component.import,
      contractRef: { artifact: "public-components", id: component.id },
      semantics,
      capabilities: (mapping?.capabilities ?? []).map((name) => ({
        name,
        status: "mapped",
        confidence: 1,
        source: ".ui-context/mappings.json",
      })),
      formAdapters: (mapping?.formAdapters ?? []).map((name) => ({
        name,
        status: "mapped",
        confidence: 1,
        source: ".ui-context/mappings.json",
      })),
      annotations: annotation?.summary ? [annotation.summary] : [],
      restrictions: annotation?.restrictions ?? [],
      deprecated: component.contract.deprecated ?? false,
    });
  }

  for (const pack of input.packs) {
    for (const component of pack.componentsById.values()) {
      if (
        !component.verified ||
        excluded.has(component.id) ||
        !installedExportExists(
          input.installedPackages,
          component.package,
          component.export,
        )
      )
        continue;
      components.push({
        id: component.id,
        availability: "verified",
        import: {
          source: component.package,
          export: component.export,
          style: component.exportKind,
        },
        contractRef: {
          artifact: "installed-packages",
          package: component.package,
          export: component.export,
        },
        semantics: component.semanticRoles.map((role) => ({
          role,
          status: "pack-owned",
          confidence: 1,
          source: `design-system-packs/${pack.manifest.id}/catalog.json`,
        })),
        capabilities: component.capabilities.map((name) => ({
          name,
          status: "pack-owned",
          confidence: 1,
          source: `design-system-packs/${pack.manifest.id}/catalog.json`,
        })),
        formAdapters: component.formAdapters.map((name) => ({
          name,
          status: "pack-owned",
          confidence: 1,
          source: `design-system-packs/${pack.manifest.id}/catalog.json`,
        })),
        annotations: [],
        restrictions: [],
        deprecated: false,
      });
    }
  }

  const diagnostics = [
    ...input.publicComponents.diagnostics,
    ...input.installedPackages.diagnostics,
  ];
  const catalog: EffectiveComponentCatalogV1 = {
    schema: "effective-component-catalog/v1",
    framework: "react",
    language: "typescript",
    fingerprint: input.fingerprint,
    artifacts: {
      publicComponents: {
        path: ".ui-context/generated/public-components.json",
        sha256: input.fingerprint.inputs.project,
      },
      installedPackages: {
        path: ".ui-context/generated/installed-packages.json",
        sha256: hashContextValue(input.installedPackages),
      },
      diagnostics: {
        path: ".ui-context/generated/diagnostics.json",
        sha256: hashContextValue(diagnostics),
      },
    },
    sources: [
      {
        kind: "project" as const,
        id: "project",
        version: "1",
        sha256: input.fingerprint.inputs.project,
      },
      ...input.packs.map((pack) => ({
        kind: "design-system-pack" as const,
        id: pack.manifest.id,
        version: pack.manifest.version,
        sha256: pack.sha256,
      })),
    ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    components: components.sort((a, b) => a.id.localeCompare(b.id)),
    icons: input.publicComponents.icons.map((icon) => ({
      id: icon.id,
      availability: "verified",
      import: icon.import,
      aliases: icon.aliases,
      contractRef: { artifact: "public-components", id: icon.id },
    })),
    diagnostics,
    summary: {
      verifiedComponents: components.length,
      mappedRoles: components.reduce(
        (count, component) =>
          count +
          component.semantics.filter((entry) => entry.status === "mapped")
            .length,
        0,
      ),
      suggestedRoles: components.reduce(
        (count, component) =>
          count +
          component.semantics.filter((entry) => entry.status === "suggested")
            .length,
        0,
      ),
      verifiedIcons: input.publicComponents.icons.length,
      warnings: diagnostics.filter((entry) => entry.severity === "warning")
        .length,
    },
  };
  assertEffectiveComponentCatalogV1Integrity(catalog);
  return catalog;
}

function installedExportExists(
  installed: InstalledPackagesV1,
  packageName: string,
  exportName: string,
): boolean {
  return installed.packages.some(
    (entry) =>
      entry.name === packageName &&
      entry.publicTypeEntries.some((types) =>
        types.exports.includes(exportName),
      ),
  );
}

function fail(
  code:
    | "MAPPING_TARGET_NOT_FOUND"
    | "SEMANTIC_ROLE_UNKNOWN"
    | "COMPONENT_CAPABILITY_UNKNOWN"
    | "FORM_ADAPTER_UNKNOWN",
  value: string,
): never {
  throw new ProjectContextError(code, `${code}: ${value}`);
}
