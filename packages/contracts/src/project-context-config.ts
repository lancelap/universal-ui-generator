import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

export const WorkspaceRelativePathSchema = Type.String({
  minLength: 1,
  pattern:
    "^(?![\\\\/])(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)).+$",
});

export const PublicImportSourceSchema = Type.String({
  minLength: 1,
  pattern: "^(?![.]{1,2}(?:/|$))[^#]+$",
});

export const ProjectComponentIdSchema = Type.String({
  pattern: "^project:[^#]+#[^#]+$",
});

const PackIdSchema = Type.String({
  minLength: 1,
  pattern: "^[a-z0-9][a-z0-9._-]*$",
});

export const PublicRootSchema = closedObject({
  path: WorkspaceRelativePathSchema,
  entry: WorkspaceRelativePathSchema,
  importSource: PublicImportSourceSchema,
});

export const UiContextConfigV1Schema = closedObject({
  schema: Type.Literal("ui-context-config/v1"),
  framework: Type.Literal("react"),
  language: Type.Literal("typescript"),
  designSystemPacks: Type.Array(PackIdSchema, { uniqueItems: true }),
  componentRoots: Type.Array(PublicRootSchema),
  iconRoots: Type.Array(PublicRootSchema),
  workspacePackages: closedObject({
    discovery: Type.Literal("public-exports"),
  }),
  ignore: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
});

const SemanticMappingSchema = closedObject({
  componentId: ProjectComponentIdSchema,
  semanticRoles: Type.Array(Type.String({ minLength: 1 }), {
    uniqueItems: true,
  }),
  capabilities: Type.Array(Type.String({ minLength: 1 }), {
    uniqueItems: true,
  }),
  formAdapters: Type.Array(Type.String({ minLength: 1 }), {
    uniqueItems: true,
  }),
  status: Type.Literal("mapped"),
});

const ExactDesignMappingSchema = closedObject({
  provider: Type.String({ minLength: 1 }),
  designSystem: Type.String({ minLength: 1 }),
  componentKey: Type.String({ minLength: 1 }),
  componentId: ProjectComponentIdSchema,
  status: Type.Literal("mapped"),
});

export const ProjectComponentMappingsV1Schema = closedObject({
  schema: Type.Literal("project-component-mappings/v1"),
  components: Type.Array(SemanticMappingSchema),
  designComponents: Type.Array(ExactDesignMappingSchema),
});

const ComponentExampleSchema = closedObject({
  name: Type.String({ minLength: 1 }),
  code: Type.String({ minLength: 1 }),
});

const ComponentAnnotationSchema = closedObject({
  componentId: ProjectComponentIdSchema,
  summary: Type.Optional(Type.String({ minLength: 1 })),
  usage: Type.Array(Type.String({ minLength: 1 })),
  restrictions: Type.Array(Type.String({ minLength: 1 })),
  examples: Type.Array(ComponentExampleSchema),
});

export const ProjectComponentAnnotationsV1Schema = closedObject({
  schema: Type.Literal("project-component-annotations/v1"),
  components: Type.Array(ComponentAnnotationSchema),
});

export const ProjectComponentPoliciesV1Schema = closedObject({
  schema: Type.Literal("project-component-policies/v1"),
  resolution: closedObject({
    allowSuggested: Type.Literal(false),
    allowNativeFallback: Type.Boolean(),
    preferProjectComponents: Type.Literal(true),
  }),
  components: closedObject({
    excluded: Type.Array(ProjectComponentIdSchema, { uniqueItems: true }),
    deprecatedAllowed: Type.Boolean(),
  }),
  imports: closedObject({
    preferPublicFacades: Type.Literal(true),
    allowDeepImports: Type.Literal(false),
  }),
});

export type UiContextConfigV1 = Static<typeof UiContextConfigV1Schema>;
export type PublicRoot = Static<typeof PublicRootSchema>;
export type ProjectComponentMappingsV1 = Static<
  typeof ProjectComponentMappingsV1Schema
>;
export type ProjectComponentAnnotationsV1 = Static<
  typeof ProjectComponentAnnotationsV1Schema
>;
export type ProjectComponentPoliciesV1 = Static<
  typeof ProjectComponentPoliciesV1Schema
>;
