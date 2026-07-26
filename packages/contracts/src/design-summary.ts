import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

export const OutlineNodeSchema = closedObject({
  id: Type.String({ minLength: 1 }),
  depth: Type.Integer({ minimum: 0 }),
  type: Type.String({ minLength: 1 }),
  name: Type.String(),
  childCount: Type.Integer({ minimum: 0 }),
});

export const NotableNodeSchema = closedObject({
  id: Type.String({ minLength: 1 }),
  reason: Type.Union([
    Type.Literal("component-instance"),
    Type.Literal("text"),
  ]),
  componentName: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
});

export const DesignSummarySchema = closedObject({
  schema: Type.Literal("design-summary/v1"),
  artifactId: Type.String({ minLength: 1 }),
  root: closedObject({
    id: Type.String({ minLength: 1 }),
    name: Type.String(),
    type: Type.String({ minLength: 1 }),
    size: closedObject({
      width: Type.Number({ minimum: 0 }),
      height: Type.Number({ minimum: 0 }),
    }),
  }),
  statistics: closedObject({
    nodeCount: Type.Integer({ minimum: 0 }),
    visibleNodeCount: Type.Integer({ minimum: 0 }),
    textNodeCount: Type.Integer({ minimum: 0 }),
    componentInstanceCount: Type.Integer({ minimum: 0 }),
  }),
  outline: Type.Array(OutlineNodeSchema),
  notableNodes: Type.Array(NotableNodeSchema),
  truncated: Type.Boolean(),
  queryCursor: Type.Optional(Type.String({ minLength: 1 })),
});

export type DesignSummary = Static<typeof DesignSummarySchema>;
