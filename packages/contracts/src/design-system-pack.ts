import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";
import {
  PixsoSemanticMappingV1Schema,
  PixsoSemanticMappingV2Schema,
} from "./ui-manifest.js";

export const DesignSystemPackSchema = closedObject({
  schema: Type.Literal("design-system-pack/v1"),
  id: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  version: Type.String({ minLength: 1 }),
  framework: Type.Literal("react"),
  files: closedObject({
    catalog: Type.String({ minLength: 1 }),
    semanticPolicy: Type.String({ minLength: 1 }),
    pixsoMap: Type.String({ minLength: 1 }),
    compositionRules: Type.String({ minLength: 1 }),
    tokens: Type.String({ minLength: 1 }),
    verification: Type.String({ minLength: 1 }),
  }),
});

export const ComponentBindingSchema = closedObject({
  componentId: Type.String({ minLength: 1 }),
  package: Type.String({ minLength: 1 }),
  export: Type.String({ minLength: 1 }),
  exportKind: Type.Union([Type.Literal("named"), Type.Literal("default")]),
});

export const ComponentCatalogEntrySchema = closedObject({
  id: Type.String({ minLength: 1 }),
  package: Type.String({ minLength: 1 }),
  export: Type.String({ minLength: 1 }),
  exportKind: Type.Union([Type.Literal("named"), Type.Literal("default")]),
  semanticRoles: Type.Array(Type.String({ minLength: 1 })),
  capabilities: Type.Array(Type.String({ minLength: 1 })),
  formAdapters: Type.Array(Type.String({ minLength: 1 })),
  priority: Type.Integer(),
  verified: Type.Boolean(),
  requiredComponentIds: Type.Array(Type.String({ minLength: 1 })),
  optionalComponentIds: Type.Array(Type.String({ minLength: 1 })),
  defaultProps: Type.Record(Type.String(), Type.Unknown()),
  provenance: closedObject({
    kind: Type.String({ minLength: 1 }),
    source: Type.String({ minLength: 1 }),
  }),
});

export const ComponentCatalogSchema = closedObject({
  schema: Type.Literal("component-catalog/v1"),
  components: Type.Array(ComponentCatalogEntrySchema),
});

export const SemanticRolePolicySchema = closedObject({
  allowedDecisions: Type.Array(
    Type.Union([
      Type.Literal("reuse"),
      Type.Literal("compose"),
      Type.Literal("fallback"),
      Type.Literal("blocked"),
    ]),
    { minItems: 1 },
  ),
  candidateComponentIds: Type.Array(Type.String({ minLength: 1 })),
  nativeFallback: Type.Boolean(),
  unresolvedCode: Type.String({ minLength: 1 }),
});

export const SemanticPolicySchema = closedObject({
  schema: Type.Literal("semantic-policy/v1"),
  roles: Type.Record(Type.String({ minLength: 1 }), SemanticRolePolicySchema),
});

export const PixsoMapV1Schema = closedObject({
  schema: Type.Literal("pixso-map/v1"),
  mappings: Type.Array(PixsoSemanticMappingV1Schema),
});

export const PixsoMapV2Schema = closedObject({
  schema: Type.Literal("pixso-map/v2"),
  mappings: Type.Array(PixsoSemanticMappingV2Schema),
});

export const PixsoMapSchema = Type.Union([PixsoMapV1Schema, PixsoMapV2Schema]);

export const CompositionRuleSchema = closedObject({
  id: Type.String({ minLength: 1 }),
  semanticRole: Type.String({ minLength: 1 }),
  rootComponentId: Type.String({ minLength: 1 }),
  slots: Type.Record(
    Type.String({ minLength: 1 }),
    Type.String({ minLength: 1 }),
  ),
});

export const CompositionRulesSchema = closedObject({
  schema: Type.Literal("composition-rules/v1"),
  rules: Type.Array(CompositionRuleSchema),
});

export const TokenValueSchema = closedObject({
  type: Type.Union([
    Type.Literal("color"),
    Type.Literal("dimension"),
    Type.Literal("number"),
    Type.Literal("string"),
  ]),
  value: Type.Union([Type.String(), Type.Number()]),
  unit: Type.Optional(Type.String()),
});

export const DesignTokensSchema = closedObject({
  schema: Type.Literal("design-tokens/v1"),
  tokens: Type.Record(Type.String({ minLength: 1 }), TokenValueSchema),
});

export const VerificationSchema = closedObject({
  schema: Type.Literal("component-verification/v1"),
  components: Type.Array(
    closedObject({
      componentId: Type.String({ minLength: 1 }),
      status: Type.Union([
        Type.Literal("verified"),
        Type.Literal("unverified"),
      ]),
      source: Type.String({ minLength: 1 }),
    }),
  ),
});

export type DesignSystemPack = Static<typeof DesignSystemPackSchema>;
export type ComponentBinding = Static<typeof ComponentBindingSchema>;
export type ComponentCatalogEntry = Static<typeof ComponentCatalogEntrySchema>;
export type ComponentCatalog = Static<typeof ComponentCatalogSchema>;
export type SemanticRolePolicy = Static<typeof SemanticRolePolicySchema>;
export type SemanticPolicy = Static<typeof SemanticPolicySchema>;
export type PixsoMapV1 = Static<typeof PixsoMapV1Schema>;
export type PixsoMapV2 = Static<typeof PixsoMapV2Schema>;
export type PixsoMap = PixsoMapV1 | PixsoMapV2;
export type CompositionRule = Static<typeof CompositionRuleSchema>;
export type CompositionRules = Static<typeof CompositionRulesSchema>;
export type DesignTokens = Static<typeof DesignTokensSchema>;
export type Verification = Static<typeof VerificationSchema>;
