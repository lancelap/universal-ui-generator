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

export const SemanticChildrenPolicySchema = Type.Union([
  Type.Literal("forbidden"),
  Type.Literal("optional"),
  Type.Literal("required"),
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

export const ReactComponentRecipeSchema = closedObject({
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
  semanticChildrenPolicy: SemanticChildrenPolicySchema,
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

export const ReactRenderRecipesSchema = closedObject({
  schema: Type.Literal("react-render-recipes/v1"),
  components: Type.Array(ReactComponentRecipeSchema),
  compositions: Type.Array(ReactCompositionRecipeSchema),
});

export type RecipeProvenance = Static<typeof RecipeProvenanceSchema>;
export type ContentSource = Static<typeof ContentSourceSchema>;
export type StateSource = Static<typeof StateSourceSchema>;
export type EventSource = Static<typeof EventSourceSchema>;
export type SemanticChildrenPolicy = Static<
  typeof SemanticChildrenPolicySchema
>;
export type CompositionCardinality = Static<
  typeof CompositionCardinalitySchema
>;
export type ReactComponentRecipe = Static<
  typeof ReactComponentRecipeSchema
>;
export type ReactCompositionSlot = Static<
  typeof ReactCompositionSlotSchema
>;
export type ReactCompositionRecipe = Static<
  typeof ReactCompositionRecipeSchema
>;
export type ReactRenderRecipes = Static<typeof ReactRenderRecipesSchema>;
