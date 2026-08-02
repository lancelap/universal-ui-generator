import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";
import { WorkspaceRelativePathSchema } from "./project-context-config.js";
import {
  ProjectScanDiagnosticSchema,
  VerifiedImportSchema,
} from "./project-component-contract.js";

const Sha256Schema = Type.String({ pattern: "^[a-f0-9]{64}$" });

export const EffectiveCatalogFingerprintSchema = closedObject({
  algorithm: Type.Literal("sha256"),
  value: Sha256Schema,
  inputs: closedObject({
    config: Sha256Schema,
    project: Sha256Schema,
    mappings: Sha256Schema,
    annotations: Sha256Schema,
    policies: Sha256Schema,
    lockfile: Sha256Schema,
    installedPackages: Sha256Schema,
    designSystemPacks: Type.Record(Type.String({ minLength: 1 }), Sha256Schema),
  }),
});

const ArtifactReferenceSchema = closedObject({
  path: WorkspaceRelativePathSchema,
  sha256: Sha256Schema,
});

const EffectiveSemanticSchema = closedObject({
  role: Type.String({ minLength: 1 }),
  status: Type.Union([
    Type.Literal("suggested"),
    Type.Literal("mapped"),
    Type.Literal("pack-owned"),
  ]),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  source: WorkspaceRelativePathSchema,
});

const EffectiveNamedBindingSchema = closedObject({
  name: Type.String({ minLength: 1 }),
  status: Type.Union([
    Type.Literal("suggested"),
    Type.Literal("mapped"),
    Type.Literal("pack-owned"),
  ]),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  source: WorkspaceRelativePathSchema,
});

const EffectiveComponentSchema = closedObject({
  id: Type.String({ minLength: 1 }),
  availability: Type.Literal("verified"),
  import: VerifiedImportSchema,
  contractRef: Type.Union([
    closedObject({
      artifact: Type.Literal("public-components"),
      id: Type.String({ minLength: 1 }),
    }),
    closedObject({
      artifact: Type.Literal("installed-packages"),
      package: Type.String({ minLength: 1 }),
      export: Type.String({ minLength: 1 }),
    }),
  ]),
  semantics: Type.Array(EffectiveSemanticSchema),
  capabilities: Type.Array(EffectiveNamedBindingSchema),
  formAdapters: Type.Array(EffectiveNamedBindingSchema),
  annotations: Type.Array(Type.String({ minLength: 1 })),
  restrictions: Type.Array(Type.String({ minLength: 1 })),
  deprecated: Type.Boolean(),
});

const EffectiveIconSchema = closedObject({
  id: Type.String({ minLength: 1 }),
  availability: Type.Literal("verified"),
  import: VerifiedImportSchema,
  aliases: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
  contractRef: closedObject({
    artifact: Type.Literal("public-components"),
    id: Type.String({ minLength: 1 }),
  }),
});

export const EffectiveComponentCatalogV1Schema = closedObject({
  schema: Type.Literal("effective-component-catalog/v1"),
  framework: Type.Literal("react"),
  language: Type.Literal("typescript"),
  fingerprint: EffectiveCatalogFingerprintSchema,
  artifacts: closedObject({
    publicComponents: ArtifactReferenceSchema,
    installedPackages: ArtifactReferenceSchema,
    diagnostics: ArtifactReferenceSchema,
  }),
  sources: Type.Array(
    closedObject({
      kind: Type.Union([
        Type.Literal("project"),
        Type.Literal("design-system-pack"),
      ]),
      id: Type.String({ minLength: 1 }),
      version: Type.String({ minLength: 1 }),
      sha256: Sha256Schema,
    }),
  ),
  components: Type.Array(EffectiveComponentSchema),
  icons: Type.Array(EffectiveIconSchema),
  diagnostics: Type.Array(ProjectScanDiagnosticSchema),
  summary: closedObject({
    verifiedComponents: Type.Integer({ minimum: 0 }),
    mappedRoles: Type.Integer({ minimum: 0 }),
    suggestedRoles: Type.Integer({ minimum: 0 }),
    verifiedIcons: Type.Integer({ minimum: 0 }),
    warnings: Type.Integer({ minimum: 0 }),
  }),
});

export type EffectiveCatalogFingerprint = Static<
  typeof EffectiveCatalogFingerprintSchema
>;
export type EffectiveComponentCatalogV1 = Static<
  typeof EffectiveComponentCatalogV1Schema
>;

export function assertEffectiveComponentCatalogV1Integrity(
  value: EffectiveComponentCatalogV1,
): void {
  assertUnique(
    value.sources.map(
      (source) => `${source.kind}:${source.id}@${source.version}`,
    ),
    "source",
  );
  assertUnique(
    value.components.map((component) => component.id),
    "component",
  );
  assertUnique(
    value.icons.map((icon) => icon.id),
    "icon",
  );

  for (const component of value.components) {
    if (
      component.contractRef.artifact === "public-components" &&
      component.contractRef.id !== component.id
    ) {
      throw new Error(
        `contractRef for ${component.id} must reference the same component`,
      );
    }
  }
  for (const icon of value.icons) {
    if (icon.contractRef.id !== icon.id) {
      throw new Error(
        `contractRef for ${icon.id} must reference the same icon`,
      );
    }
  }

  const expected = {
    verifiedComponents: value.components.length,
    mappedRoles: value.components.reduce(
      (count, component) =>
        count +
        component.semantics.filter((entry) => entry.status === "mapped").length,
      0,
    ),
    suggestedRoles: value.components.reduce(
      (count, component) =>
        count +
        component.semantics.filter((entry) => entry.status === "suggested")
          .length,
      0,
    ),
    verifiedIcons: value.icons.length,
    warnings: value.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning",
    ).length,
  };

  for (const [key, count] of Object.entries(expected)) {
    if (value.summary[key as keyof typeof expected] !== count) {
      throw new Error(
        `${key} summary is ${value.summary[key as keyof typeof expected]}, expected ${count}`,
      );
    }
  }
}

function assertUnique(values: readonly string[], kind: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`duplicate ${kind}: ${value}`);
    }
    seen.add(value);
  }
}
