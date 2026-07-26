import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

const RelativePackPathSchema = Type.String({
  minLength: 1,
  pattern:
    "^(?![\\\\/])(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)).+$",
});

export const DesignSystemPackV2Schema = closedObject({
  schema: Type.Literal("design-system-pack/v2"),
  id: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  version: Type.String({ minLength: 1 }),
  framework: Type.Literal("react"),
  files: closedObject({
    catalog: RelativePackPathSchema,
    semanticPolicy: RelativePackPathSchema,
    pixsoMap: RelativePackPathSchema,
    compositionRules: RelativePackPathSchema,
    tokens: RelativePackPathSchema,
    verification: RelativePackPathSchema,
    reactRenderRecipes: RelativePackPathSchema,
    reactStylePolicy: RelativePackPathSchema,
  }),
});

export type DesignSystemPackV2 = Static<typeof DesignSystemPackV2Schema>;
