import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

export const DiagnosticSeveritySchema = Type.Union([
  Type.Literal("info"),
  Type.Literal("warning"),
  Type.Literal("error"),
]);

export const DiagnosticSourceSchema = closedObject({
  artifactId: Type.Optional(Type.String({ minLength: 1 })),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
  manifestNodeId: Type.Optional(Type.String({ minLength: 1 })),
});

export const DiagnosticSchema = closedObject({
  severity: DiagnosticSeveritySchema,
  blocking: Type.Boolean(),
  stage: Type.String({ minLength: 1 }),
  code: Type.String({ minLength: 1 }),
  message: Type.String({ minLength: 1 }),
  source: Type.Optional(DiagnosticSourceSchema),
  evidence: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  suggestions: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
});

export type Diagnostic = Static<typeof DiagnosticSchema>;
