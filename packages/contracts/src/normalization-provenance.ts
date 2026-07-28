import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

export const NormalizationOriginKindSchema = Type.Union([
  Type.Literal("instance-value"),
  Type.Literal("instance-override"),
  Type.Literal("component-default"),
]);

export const NormalizationValueOriginSchema = closedObject({
  targetNodeId: Type.String({ minLength: 1 }),
  targetPath: Type.String({ pattern: "^/" }),
  kind: NormalizationOriginKindSchema,
  sourceNodeId: Type.String({ minLength: 1 }),
  componentKey: Type.Optional(Type.String({ minLength: 1 })),
  componentDefinitionNodeId: Type.Optional(Type.String({ minLength: 1 })),
  sourcePropertyPath: Type.Optional(Type.String({ minLength: 1 })),
});

export const NormalizationProvenanceV1Schema = closedObject({
  schema: Type.Literal("normalization-provenance/v1"),
  sourceArtifactId: Type.String({ minLength: 1 }),
  values: Type.Array(NormalizationValueOriginSchema),
});

export type NormalizationOriginKind = Static<
  typeof NormalizationOriginKindSchema
>;
export type NormalizationValueOrigin = Static<
  typeof NormalizationValueOriginSchema
>;
export type NormalizationProvenanceV1 = Static<
  typeof NormalizationProvenanceV1Schema
>;
