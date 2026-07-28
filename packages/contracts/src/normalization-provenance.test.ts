import { describe, expect, it } from "vitest";

import {
  NormalizationProvenanceV1Schema,
  validateWithSchema,
} from "./index.js";

const valid = {
  schema: "normalization-provenance/v1",
  sourceArtifactId: "pixso_doc_4_314_hash",
  values: [
    {
      targetNodeId: "4:557/4:460/4:557",
      targetPath: "/text/value",
      kind: "component-default",
      sourceNodeId: "4:557",
      componentKey: "af0f129be938c583514d48eb0a0544bcc6015135",
      componentDefinitionNodeId: "4:445",
      sourcePropertyPath: "4:460/4:557",
    },
    {
      targetNodeId: "4:599/4:461/4:599",
      targetPath: "/text/value",
      kind: "instance-override",
      sourceNodeId: "4:599",
      sourcePropertyPath: "4:461/4:599",
    },
  ],
};

describe("NormalizationProvenanceV1Schema", () => {
  it("accepts deterministic value-level origins", () => {
    expect(validateWithSchema(NormalizationProvenanceV1Schema, valid)).toEqual(
      valid,
    );
  });

  it("rejects unknown fields and unsupported origin kinds", () => {
    expect(() =>
      validateWithSchema(NormalizationProvenanceV1Schema, {
        ...valid,
        rawDsl: {},
      }),
    ).toThrow(/rawDsl/);
    expect(() =>
      validateWithSchema(NormalizationProvenanceV1Schema, {
        ...valid,
        values: [{ ...valid.values[0], kind: "guessed" }],
      }),
    ).toThrow(/kind/);
  });
});
