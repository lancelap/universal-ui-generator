import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { DiagnosticSchema } from "./diagnostic.js";
import { ResolutionNodeSchema } from "./resolution-plan.js";
import { closedObject } from "./schema-utils.js";

const Sha256Schema = Type.String({ pattern: "^[a-f0-9]{64}$" });

export const DesignIRSourceReferenceSchema = closedObject({
  artifactId: Type.String({ minLength: 1 }),
  schema: Type.Literal("design-ir/v2"),
  sha256: Sha256Schema,
});

export const UiManifestSourceReferenceSchema = closedObject({
  artifactId: Type.String({ minLength: 1 }),
  schema: Type.Literal("ui-manifest/v2"),
  sha256: Sha256Schema,
});

export const ResolutionTargetV2Schema = closedObject({
  framework: Type.Literal("react"),
  language: Type.Literal("typescript"),
  designSystem: Type.String({ minLength: 1 }),
  designSystemVersion: Type.String({ minLength: 1 }),
  packSha256: Sha256Schema,
});

const ResolutionSummaryV2Schema = closedObject({
  reuse: Type.Integer({ minimum: 0 }),
  compose: Type.Integer({ minimum: 0 }),
  fallback: Type.Integer({ minimum: 0 }),
  blocked: Type.Integer({ minimum: 0 }),
});

export const ResolutionPlanV2Schema = closedObject({
  schema: Type.Literal("resolution-plan/v2"),
  source: closedObject({
    designIr: DesignIRSourceReferenceSchema,
    uiManifest: UiManifestSourceReferenceSchema,
  }),
  target: ResolutionTargetV2Schema,
  nodes: Type.Array(ResolutionNodeSchema),
  diagnostics: Type.Array(DiagnosticSchema),
  summary: ResolutionSummaryV2Schema,
});

export type DesignIRSourceReference = Static<
  typeof DesignIRSourceReferenceSchema
>;
export type UiManifestSourceReference = Static<
  typeof UiManifestSourceReferenceSchema
>;
export type ResolutionSourceReference =
  DesignIRSourceReference | UiManifestSourceReference;
export type ResolutionTargetV2 = Static<typeof ResolutionTargetV2Schema>;
export type ResolutionPlanV2 = Static<typeof ResolutionPlanV2Schema>;

export function assertResolutionPlanV2Integrity(plan: ResolutionPlanV2): void {
  const actual = {
    reuse: 0,
    compose: 0,
    fallback: 0,
    blocked: 0,
  };

  for (const node of plan.nodes) {
    actual[node.decision] += 1;
  }

  for (const decision of ["reuse", "compose", "fallback", "blocked"] as const) {
    if (actual[decision] !== plan.summary[decision]) {
      throw new Error(
        `RESOLUTION_V2_INTEGRITY: summary.${decision} is ${plan.summary[decision]}, expected ${actual[decision]}`,
      );
    }
  }
}
