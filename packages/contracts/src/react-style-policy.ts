import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { RecipeProvenanceSchema } from "./react-render-recipes.js";
import { closedObject } from "./schema-utils.js";

export const LayoutStylePropertySchema = Type.Union([
  Type.Literal("display"),
  Type.Literal("flexDirection"),
  Type.Literal("gap"),
  Type.Literal("padding"),
  Type.Literal("width"),
  Type.Literal("minWidth"),
  Type.Literal("maxWidth"),
  Type.Literal("height"),
  Type.Literal("minHeight"),
  Type.Literal("maxHeight"),
  Type.Literal("alignItems"),
  Type.Literal("justifyContent"),
  Type.Literal("alignSelf"),
  Type.Literal("flexWrap"),
  Type.Literal("position"),
  Type.Literal("inset"),
]);

export const AppearanceStylePropertySchema = Type.Union([
  Type.Literal("background"),
  Type.Literal("color"),
  Type.Literal("border"),
  Type.Literal("borderRadius"),
  Type.Literal("boxShadow"),
  Type.Literal("opacity"),
  Type.Literal("fontFamily"),
  Type.Literal("fontSize"),
  Type.Literal("fontWeight"),
  Type.Literal("lineHeight"),
  Type.Literal("textAlign"),
]);

const LayoutAllowanceSchema = closedObject({
  allowed: Type.Array(LayoutStylePropertySchema, { uniqueItems: true }),
});

const AppearanceAllowanceSchema = closedObject({
  allowed: Type.Array(AppearanceStylePropertySchema, { uniqueItems: true }),
});

const ComponentStylePolicySchema = closedObject({
  componentId: Type.String({ minLength: 1 }),
  layout: LayoutAllowanceSchema,
  appearance: AppearanceAllowanceSchema,
  wrapper: Type.Union([Type.Literal("allowed"), Type.Literal("forbidden")]),
});

export const ReactStylePolicySchema = closedObject({
  schema: Type.Literal("react-style-policy/v1"),
  defaults: closedObject({
    layout: LayoutAllowanceSchema,
    appearance: AppearanceAllowanceSchema,
    internalSelectors: Type.Literal(false),
    inlineStyles: Type.Literal(false),
  }),
  components: Type.Array(ComponentStylePolicySchema),
  fallback: closedObject({
    layout: Type.Literal("all-supported"),
    appearance: Type.Literal("all-supported"),
  }),
  provenance: RecipeProvenanceSchema,
});

export type LayoutStyleProperty = Static<typeof LayoutStylePropertySchema>;
export type AppearanceStyleProperty = Static<
  typeof AppearanceStylePropertySchema
>;
export type ReactStylePolicy = Static<typeof ReactStylePolicySchema>;
