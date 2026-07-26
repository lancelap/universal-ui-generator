import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { DiagnosticSchema } from "./diagnostic.js";
import { closedObject } from "./schema-utils.js";

export const GeometrySchema = closedObject({
  x: Type.Number(),
  y: Type.Number(),
  width: Type.Number({ minimum: 0 }),
  height: Type.Number({ minimum: 0 }),
});

export const PaddingSchema = closedObject({
  top: Type.Number(),
  right: Type.Number(),
  bottom: Type.Number(),
  left: Type.Number(),
});

export const LayoutSchema = closedObject({
  mode: Type.Union([
    Type.Literal("none"),
    Type.Literal("vertical"),
    Type.Literal("horizontal"),
  ]),
  gap: Type.Number(),
  padding: PaddingSchema,
  alignItems: Type.String({ minLength: 1 }),
  justifyContent: Type.Optional(Type.String({ minLength: 1 })),
  wrap: Type.Optional(Type.Boolean()),
});

export const ColorSchema = closedObject({
  color: Type.String({ pattern: "^#[A-F0-9]{6}$" }),
  opacity: Type.Number({ minimum: 0, maximum: 1 }),
});

export const FillSchema = closedObject({
  type: Type.Union([
    Type.Literal("solid"),
    Type.Literal("gradient"),
    Type.Literal("image"),
    Type.Literal("unsupported"),
  ]),
  color: Type.Optional(Type.String({ pattern: "^#[A-F0-9]{6}$" })),
  opacity: Type.Number({ minimum: 0, maximum: 1 }),
});

export const BorderWidthSchema = closedObject({
  top: Type.Number({ minimum: 0 }),
  right: Type.Number({ minimum: 0 }),
  bottom: Type.Number({ minimum: 0 }),
  left: Type.Number({ minimum: 0 }),
});

export const BorderSchema = closedObject({
  position: Type.Union([
    Type.Literal("inside"),
    Type.Literal("outside"),
    Type.Literal("center"),
  ]),
  width: BorderWidthSchema,
  style: Type.Union([
    Type.Literal("solid"),
    Type.Literal("dashed"),
    Type.Literal("dotted"),
  ]),
  color: Type.String({ pattern: "^#[A-F0-9]{6}$" }),
  opacity: Type.Number({ minimum: 0, maximum: 1 }),
});

export const RadiiSchema = closedObject({
  topLeft: Type.Number({ minimum: 0 }),
  topRight: Type.Number({ minimum: 0 }),
  bottomRight: Type.Number({ minimum: 0 }),
  bottomLeft: Type.Number({ minimum: 0 }),
});

export const ShadowSchema = closedObject({
  type: Type.Union([Type.Literal("drop"), Type.Literal("inner")]),
  x: Type.Number(),
  y: Type.Number(),
  blur: Type.Number({ minimum: 0 }),
  spread: Type.Number(),
  color: Type.String({ pattern: "^#[A-F0-9]{6}$" }),
  opacity: Type.Number({ minimum: 0, maximum: 1 }),
});

export const AppearanceSchema = closedObject({
  fills: Type.Array(FillSchema),
  borders: Type.Array(BorderSchema),
  radii: RadiiSchema,
  shadows: Type.Array(ShadowSchema),
  opacity: Type.Number({ minimum: 0, maximum: 1 }),
});

export const TextContentSchema = closedObject({
  value: Type.String(),
  fontFamily: Type.Optional(Type.String()),
  fontSize: Type.Optional(Type.Number({ minimum: 0 })),
  fontWeight: Type.Optional(Type.Number({ minimum: 0 })),
  lineHeight: Type.Optional(Type.Number({ minimum: 0 })),
  textAlign: Type.Optional(Type.String()),
});

export const ComponentReferenceSchema = closedObject({
  key: Type.String({ minLength: 1 }),
  variant: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  properties: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const DesignNodeSchema = closedObject({
  id: Type.String({ minLength: 1 }),
  type: Type.String({ minLength: 1 }),
  name: Type.String(),
  visible: Type.Boolean(),
  children: Type.Array(Type.String({ minLength: 1 })),
  geometry: GeometrySchema,
  layout: Type.Optional(LayoutSchema),
  appearance: AppearanceSchema,
  text: Type.Optional(TextContentSchema),
  component: Type.Optional(ComponentReferenceSchema),
  source: closedObject({
    provider: Type.Literal("pixso"),
    nodeId: Type.String({ minLength: 1 }),
  }),
});

export const DesignIRSchema = closedObject({
  schema: Type.Literal("design-ir/v1"),
  sourceArtifactId: Type.String({ minLength: 1 }),
  dslVersion: Type.String({ minLength: 1 }),
  rootNodeId: Type.String({ minLength: 1 }),
  nodes: Type.Record(Type.String({ minLength: 1 }), DesignNodeSchema),
  diagnostics: Type.Array(DiagnosticSchema),
});

export type Geometry = Static<typeof GeometrySchema>;
export type Layout = Static<typeof LayoutSchema>;
export type Appearance = Static<typeof AppearanceSchema>;
export type DesignNode = Static<typeof DesignNodeSchema>;
export type DesignIR = Static<typeof DesignIRSchema>;
