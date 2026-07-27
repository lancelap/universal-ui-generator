import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

export const RecipeProvenanceSchema = closedObject({
  kind: Type.String({ minLength: 1 }),
  source: Type.String({ minLength: 1 }),
});

export const ContentSourceSchema = Type.Union([
  Type.Literal("content.text"),
  Type.Literal("content.label"),
  Type.Literal("content.value"),
]);

export const StateSourceSchema = Type.Union([
  Type.Literal("state.disabled"),
  Type.Literal("state.checked"),
  Type.Literal("state.required"),
  Type.Literal("state.placeholder"),
]);

export const EventSourceSchema = Type.Union([
  Type.Literal("activate"),
  Type.Literal("change"),
]);

export const SemanticChildrenPolicyV1Schema = Type.Union([
  Type.Literal("forbidden"),
  Type.Literal("optional"),
  Type.Literal("required"),
]);

export const SemanticChildrenPolicyV2Schema = Type.Union([
  Type.Literal("forbidden"),
  Type.Literal("optional"),
  Type.Literal("required"),
  Type.Literal("render-only-optional"),
]);

export const CompositionCardinalitySchema = Type.Union([
  Type.Literal("zero-or-one"),
  Type.Literal("exactly-one"),
  Type.Literal("many"),
  Type.Literal("one-or-more"),
]);

const WrapperPolicySchema = Type.Union([
  Type.Literal("allowed"),
  Type.Literal("forbidden"),
]);

const PropValueTypeSchema = Type.Union([
  Type.Literal("string"),
  Type.Literal("boolean"),
  Type.Literal("number"),
]);

export const ReactComponentRecipeV1Schema = closedObject({
  componentId: Type.String({ minLength: 1 }),
  content: Type.Optional(
    closedObject({
      source: ContentSourceSchema,
      target: Type.String({ minLength: 1 }),
    }),
  ),
  stateProps: Type.Array(
    closedObject({
      source: StateSourceSchema,
      target: Type.String({ minLength: 1 }),
      valueType: PropValueTypeSchema,
    }),
  ),
  eventProps: Type.Array(
    closedObject({
      source: EventSourceSchema,
      target: Type.String({ minLength: 1 }),
    }),
  ),
  classNameProp: Type.Optional(Type.String({ minLength: 1 })),
  semanticChildrenPolicy: SemanticChildrenPolicyV1Schema,
  wrapper: WrapperPolicySchema,
  provenance: RecipeProvenanceSchema,
});

export const StaticRenderPropValueSchema = Type.Union([
  closedObject({
    kind: Type.Literal("literal"),
    value: Type.Union([
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Null(),
    ]),
  }),
  closedObject({ kind: Type.Literal("empty-array") }),
  closedObject({ kind: Type.Literal("noop") }),
]);

export const StaticRenderPropSchema = closedObject({
  target: Type.String({ minLength: 1 }),
  value: StaticRenderPropValueSchema,
  reason: Type.Literal("render-only"),
});

export const ReactComponentRecipeV2Schema = closedObject({
  componentId: Type.String({ minLength: 1 }),
  content: Type.Optional(
    closedObject({
      source: ContentSourceSchema,
      target: Type.String({ minLength: 1 }),
      required: Type.Optional(Type.Boolean()),
    }),
  ),
  staticProps: Type.Array(StaticRenderPropSchema),
  stateProps: Type.Array(
    closedObject({
      source: StateSourceSchema,
      target: Type.String({ minLength: 1 }),
      valueType: PropValueTypeSchema,
    }),
  ),
  eventProps: Type.Array(
    closedObject({
      source: EventSourceSchema,
      target: Type.String({ minLength: 1 }),
    }),
  ),
  classNameProp: Type.Optional(Type.String({ minLength: 1 })),
  semanticChildrenPolicy: SemanticChildrenPolicyV2Schema,
  wrapper: WrapperPolicySchema,
  provenance: RecipeProvenanceSchema,
});

const ExplicitRoleSlotSchema = closedObject({
  name: Type.String({ minLength: 1 }),
  componentId: Type.String({ minLength: 1 }),
  acceptsRoles: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  cardinality: CompositionCardinalitySchema,
});

const RemainingChildrenSlotSchema = closedObject({
  name: Type.String({ minLength: 1 }),
  componentId: Type.String({ minLength: 1 }),
  acceptsRemaining: Type.Literal(true),
  cardinality: CompositionCardinalitySchema,
});

export const ReactCompositionSlotSchema = Type.Union([
  ExplicitRoleSlotSchema,
  RemainingChildrenSlotSchema,
]);

export const ReactCompositionRecipeSchema = closedObject({
  compositionId: Type.String({ minLength: 1 }),
  rootComponentId: Type.String({ minLength: 1 }),
  slots: Type.Array(ReactCompositionSlotSchema),
  provenance: RecipeProvenanceSchema,
});

export const ReactRenderRecipesV1Schema = closedObject({
  schema: Type.Literal("react-render-recipes/v1"),
  components: Type.Array(ReactComponentRecipeV1Schema),
  compositions: Type.Array(ReactCompositionRecipeSchema),
});

export const ReactRenderRecipesV2Schema = closedObject({
  schema: Type.Literal("react-render-recipes/v2"),
  components: Type.Array(ReactComponentRecipeV2Schema),
  compositions: Type.Array(ReactCompositionRecipeSchema),
});

export const ReactRenderRecipesSchema = Type.Union([
  ReactRenderRecipesV1Schema,
  ReactRenderRecipesV2Schema,
]);

export type RecipeProvenance = Static<typeof RecipeProvenanceSchema>;
export type ContentSource = Static<typeof ContentSourceSchema>;
export type StateSource = Static<typeof StateSourceSchema>;
export type EventSource = Static<typeof EventSourceSchema>;
export type SemanticChildrenPolicyV1 = Static<
  typeof SemanticChildrenPolicyV1Schema
>;
export type SemanticChildrenPolicyV2 = Static<
  typeof SemanticChildrenPolicyV2Schema
>;
export type SemanticChildrenPolicy =
  SemanticChildrenPolicyV1 | SemanticChildrenPolicyV2;
export type CompositionCardinality = Static<
  typeof CompositionCardinalitySchema
>;
export type StaticRenderPropValue = Static<typeof StaticRenderPropValueSchema>;
export type StaticRenderProp = Static<typeof StaticRenderPropSchema>;
export type ReactComponentRecipeV1 = Static<
  typeof ReactComponentRecipeV1Schema
>;
export type ReactComponentRecipeV2 = Static<
  typeof ReactComponentRecipeV2Schema
>;
export type ReactComponentRecipe =
  ReactComponentRecipeV1 | ReactComponentRecipeV2;
export type ReactCompositionSlot = Static<typeof ReactCompositionSlotSchema>;
export type ReactCompositionRecipe = Static<
  typeof ReactCompositionRecipeSchema
>;
export type ReactRenderRecipesV1 = Static<typeof ReactRenderRecipesV1Schema>;
export type ReactRenderRecipesV2 = Static<typeof ReactRenderRecipesV2Schema>;
export type ReactRenderRecipes = Static<typeof ReactRenderRecipesSchema>;
