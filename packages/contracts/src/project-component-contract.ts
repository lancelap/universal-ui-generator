import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";
import {
  ProjectComponentIdSchema,
  PublicImportSourceSchema,
  WorkspaceRelativePathSchema,
} from "./project-context-config.js";

const Sha256Schema = Type.String({ pattern: "^[a-f0-9]{64}$" });

export const ProjectScanDiagnosticSchema = closedObject({
  severity: Type.Union([
    Type.Literal("info"),
    Type.Literal("warning"),
    Type.Literal("error"),
    Type.Literal("fatal"),
  ]),
  code: Type.String({ minLength: 1 }),
  message: Type.String({ minLength: 1 }),
  path: Type.Optional(WorkspaceRelativePathSchema),
  componentId: Type.Optional(ProjectComponentIdSchema),
  evidence: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const NormalizedPropTypeSchema = Type.Recursive((Self) =>
  Type.Union([
    closedObject({ kind: Type.Literal("string") }),
    closedObject({ kind: Type.Literal("number") }),
    closedObject({ kind: Type.Literal("boolean") }),
    closedObject({ kind: Type.Literal("void") }),
    closedObject({ kind: Type.Literal("react-node") }),
    closedObject({ kind: Type.Literal("react-element") }),
    closedObject({
      kind: Type.Literal("enum"),
      values: Type.Array(
        Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
      ),
    }),
    closedObject({ kind: Type.Literal("array"), element: Self }),
    closedObject({ kind: Type.Literal("tuple"), elements: Type.Array(Self) }),
    closedObject({
      kind: Type.Literal("object"),
      properties: Type.Array(
        closedObject({
          name: Type.String({ minLength: 1 }),
          required: Type.Boolean(),
          type: Self,
        }),
      ),
    }),
    closedObject({
      kind: Type.Literal("function"),
      parameters: Type.Array(
        closedObject({ name: Type.String({ minLength: 1 }), type: Self }),
      ),
      returns: Self,
    }),
    closedObject({
      kind: Type.Literal("reference"),
      name: Type.String({ minLength: 1 }),
    }),
    closedObject({
      kind: Type.Literal("opaque"),
      displayName: Type.String({ minLength: 1 }),
      reason: Type.String({ minLength: 1 }),
    }),
  ]),
);

export const VerifiedImportSchema = closedObject({
  source: PublicImportSourceSchema,
  export: Type.String({ minLength: 1 }),
  style: Type.Union([Type.Literal("named"), Type.Literal("default")]),
});

const SemanticEvidenceSchema = closedObject({
  kind: Type.String({ minLength: 1 }),
  value: Type.String({ minLength: 1 }),
});

export const SemanticSuggestionSchema = closedObject({
  role: Type.String({ minLength: 1 }),
  status: Type.Literal("suggested"),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  evidence: Type.Array(SemanticEvidenceSchema),
});

export const NamedSuggestionSchema = closedObject({
  name: Type.String({ minLength: 1 }),
  status: Type.Literal("suggested"),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  evidence: Type.Array(SemanticEvidenceSchema),
});

const ComponentEvidenceSchema = Type.Union([
  closedObject({
    kind: Type.Literal("public-export"),
    path: WorkspaceRelativePathSchema,
    export: Type.String({ minLength: 1 }),
  }),
  closedObject({
    kind: Type.Literal("typescript-contract"),
    path: WorkspaceRelativePathSchema,
    symbol: Type.String({ minLength: 1 }),
  }),
]);

const ComponentPropSchema = closedObject({
  name: Type.String({ minLength: 1 }),
  required: Type.Boolean(),
  type: NormalizedPropTypeSchema,
  description: Type.Optional(Type.String({ minLength: 1 })),
  deprecated: Type.Boolean(),
});

export const VerifiedProjectComponentSchema = closedObject({
  id: ProjectComponentIdSchema,
  kind: Type.Literal("react-component"),
  framework: Type.Literal("react"),
  availability: Type.Literal("verified"),
  import: VerifiedImportSchema,
  contract: closedObject({
    propsType: Type.String({ minLength: 1 }),
    acceptsChildren: Type.Boolean(),
    props: Type.Array(ComponentPropSchema),
    summary: Type.Optional(Type.String({ minLength: 1 })),
    deprecated: Type.Optional(Type.Boolean()),
  }),
  semantics: Type.Array(SemanticSuggestionSchema),
  capabilities: Type.Array(NamedSuggestionSchema),
  formAdapters: Type.Array(NamedSuggestionSchema),
  evidence: Type.Array(ComponentEvidenceSchema, { minItems: 1 }),
});

export const VerifiedProjectIconSchema = closedObject({
  id: ProjectComponentIdSchema,
  kind: Type.Literal("icon"),
  framework: Type.Literal("react"),
  availability: Type.Literal("verified"),
  import: VerifiedImportSchema,
  aliases: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
  evidence: Type.Array(ComponentEvidenceSchema, { minItems: 1 }),
});

const PublicTypeEntrySchema = closedObject({
  subpath: Type.String({ minLength: 1 }),
  path: WorkspaceRelativePathSchema,
  sha256: Sha256Schema,
  exports: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
});

export const InstalledPackagesV1Schema = closedObject({
  schema: Type.Literal("installed-packages/v1"),
  lockfile: closedObject({
    path: WorkspaceRelativePathSchema,
    sha256: Sha256Schema,
  }),
  packages: Type.Array(
    closedObject({
      name: Type.String({ minLength: 1 }),
      version: Type.String({ minLength: 1 }),
      packageJsonPath: WorkspaceRelativePathSchema,
      publicTypeEntries: Type.Array(PublicTypeEntrySchema),
    }),
  ),
  diagnostics: Type.Array(ProjectScanDiagnosticSchema),
});

export const PublicComponentsV1Schema = closedObject({
  schema: Type.Literal("public-components/v1"),
  components: Type.Array(VerifiedProjectComponentSchema),
  icons: Type.Array(VerifiedProjectIconSchema),
  diagnostics: Type.Array(ProjectScanDiagnosticSchema),
});

export type ProjectScanDiagnostic = Static<typeof ProjectScanDiagnosticSchema>;
export type NormalizedPropType = Static<typeof NormalizedPropTypeSchema>;
export type SemanticSuggestion = Static<typeof SemanticSuggestionSchema>;
export type CapabilitySuggestion = Static<typeof NamedSuggestionSchema>;
export type FormAdapterSuggestion = Static<typeof NamedSuggestionSchema>;
export type VerifiedProjectComponent = Static<
  typeof VerifiedProjectComponentSchema
>;
export type VerifiedProjectIcon = Static<typeof VerifiedProjectIconSchema>;
export type InstalledPackagesV1 = Static<typeof InstalledPackagesV1Schema>;
export type PublicComponentsV1 = Static<typeof PublicComponentsV1Schema>;

export function assertPublicComponentsV1Integrity(
  value: PublicComponentsV1,
): void {
  const ids = new Set<string>();
  for (const item of [...value.components, ...value.icons]) {
    if (ids.has(item.id)) {
      throw new Error(`duplicate public component ID: ${item.id}`);
    }
    ids.add(item.id);

    const expectedId = `project:${item.import.source}#${item.import.export}`;
    if (item.id !== expectedId) {
      throw new Error(
        `public component ID ${item.id} does not match import identity`,
      );
    }
    if (
      (item.import.export === "default") !==
      (item.import.style === "default")
    ) {
      throw new Error(`import style does not match export for ${item.id}`);
    }
  }
}
