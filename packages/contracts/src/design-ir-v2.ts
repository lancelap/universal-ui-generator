import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import {
  AppearanceSchema,
  ComponentReferenceSchema,
  GeometrySchema,
  LayoutSchema,
  TextContentSchema,
} from "./design-ir.js";
import { DiagnosticSchema } from "./diagnostic.js";
import { closedObject } from "./schema-utils.js";

export const LayoutPositionSchema = closedObject({
  mode: Type.Union([Type.Literal("flow"), Type.Literal("absolute")]),
  inset: Type.Optional(
    closedObject({
      top: Type.Optional(Type.Number()),
      right: Type.Optional(Type.Number()),
      bottom: Type.Optional(Type.Number()),
      left: Type.Optional(Type.Number()),
    }),
  ),
});

export const AssetMetadataSchema = closedObject({
  name: Type.String({ minLength: 1 }),
});

export const DesignNodeV2Schema = closedObject({
  id: Type.String({ minLength: 1 }),
  type: Type.String({ minLength: 1 }),
  name: Type.String(),
  visible: Type.Boolean(),
  children: Type.Array(Type.String({ minLength: 1 })),
  geometry: GeometrySchema,
  layout: Type.Optional(LayoutSchema),
  position: Type.Optional(LayoutPositionSchema),
  appearance: AppearanceSchema,
  text: Type.Optional(TextContentSchema),
  component: Type.Optional(ComponentReferenceSchema),
  asset: Type.Optional(AssetMetadataSchema),
  source: closedObject({
    provider: Type.Literal("pixso"),
    nodeId: Type.String({ minLength: 1 }),
  }),
});

export const DesignIRV2Schema = closedObject({
  schema: Type.Literal("design-ir/v2"),
  sourceArtifactId: Type.String({ minLength: 1 }),
  dslVersion: Type.String({ minLength: 1 }),
  rootNodeId: Type.String({ minLength: 1 }),
  nodes: Type.Record(Type.String({ minLength: 1 }), DesignNodeV2Schema),
  diagnostics: Type.Array(DiagnosticSchema),
});

export type LayoutPosition = Static<typeof LayoutPositionSchema>;
export type AssetMetadata = Static<typeof AssetMetadataSchema>;
export type DesignNodeV2 = Static<typeof DesignNodeV2Schema>;
export type DesignIRV2 = Static<typeof DesignIRV2Schema>;

export function assertDesignIRV2Integrity(ir: DesignIRV2): void {
  if (!(ir.rootNodeId in ir.nodes)) {
    throw new Error(
      `V2_CONTRACT_INTEGRITY: DesignIR root node "${ir.rootNodeId}" is missing`,
    );
  }
}
