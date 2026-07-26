import { describe, expect, it } from "vitest";

import {
  ContractValidationError,
  type ResolutionPlanV2,
  ResolutionPlanV2Schema,
  assertResolutionPlanV2Integrity,
  validateWithSchema,
} from "./index.js";

const planFixture: ResolutionPlanV2 = {
  schema: "resolution-plan/v2",
  source: {
    designIr: {
      artifactId: "pixso_doc_node_0123456789ab",
      schema: "design-ir/v2",
      sha256: "a".repeat(64),
    },
    uiManifest: {
      artifactId: "pixso_doc_node_0123456789ab",
      schema: "ui-manifest/v2",
      sha256: "b".repeat(64),
    },
  },
  target: {
    framework: "react",
    language: "typescript",
    designSystem: "material-ui",
    designSystemVersion: "2.0.0",
    packSha256: "c".repeat(64),
  },
  nodes: [
    {
      manifestNodeId: "ui_button",
      semanticRole: "button",
      decision: "blocked",
      confidence: 0,
      evidence: [],
      diagnosticCodes: ["COMPONENT_UNRESOLVED"],
    },
  ],
  diagnostics: [],
  summary: { reuse: 0, compose: 0, fallback: 0, blocked: 1 },
};

describe("ResolutionPlan v2", () => {
  it("requires exact design, manifest, and pack proofs", () => {
    expect(validateWithSchema(ResolutionPlanV2Schema, planFixture)).toEqual(
      planFixture,
    );
  });

  it("rejects a short source hash", () => {
    expect(() =>
      validateWithSchema(ResolutionPlanV2Schema, {
        ...planFixture,
        source: {
          ...planFixture.source,
          designIr: {
            ...planFixture.source.designIr,
            sha256: "a".repeat(12),
          },
        },
      }),
    ).toThrowError(ContractValidationError);
  });

  it.each(["designIr", "uiManifest"] as const)(
    "rejects a v1 schema literal for %s",
    (sourceName) => {
      expect(() =>
        validateWithSchema(ResolutionPlanV2Schema, {
          ...planFixture,
          source: {
            ...planFixture.source,
            [sourceName]: {
              ...planFixture.source[sourceName],
              schema:
                sourceName === "designIr" ? "design-ir/v1" : "ui-manifest/v1",
            },
          },
        }),
      ).toThrowError(ContractValidationError);
    },
  );

  it("rejects a missing design-system version", () => {
    const { designSystemVersion: _removed, ...targetWithoutVersion } =
      planFixture.target;

    expect(() =>
      validateWithSchema(ResolutionPlanV2Schema, {
        ...planFixture,
        target: targetWithoutVersion,
      }),
    ).toThrowError(ContractValidationError);
  });

  it("rejects a summary that does not match node decisions", () => {
    expect(() =>
      assertResolutionPlanV2Integrity({
        ...planFixture,
        summary: { ...planFixture.summary, blocked: 0 },
      }),
    ).toThrow(/^RESOLUTION_V2_INTEGRITY:/);
  });

  it("accepts a matching summary", () => {
    expect(() => assertResolutionPlanV2Integrity(planFixture)).not.toThrow();
  });
});
