import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

export const DesignSnapshotSchema = closedObject({
  schema: Type.Literal("design-snapshot/v1"),
  artifactId: Type.String({ minLength: 1 }),
  provider: Type.Literal("pixso"),
  source: closedObject({
    documentId: Type.String({ minLength: 1 }),
    nodeId: Type.String({ minLength: 1 }),
    url: Type.String({ minLength: 1 }),
  }),
  retrievedAt: Type.String({ minLength: 1 }),
  content: closedObject({
    format: Type.Literal("pixso-node-dsl"),
    version: Type.String({ minLength: 1 }),
    sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    byteLength: Type.Integer({ minimum: 0 }),
  }),
});

export type DesignSnapshot = Static<typeof DesignSnapshotSchema>;
