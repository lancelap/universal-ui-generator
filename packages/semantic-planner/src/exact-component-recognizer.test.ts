import type {
  Appearance,
  DesignNode,
  PixsoSemanticMapping,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { createExactComponentRecognizer } from "./exact-component-recognizer.js";

const appearance: Appearance = {
  fills: [],
  borders: [],
  radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  shadows: [],
  opacity: 1,
};
const instance: DesignNode = {
  id: "4:341",
  type: "instance",
  name: "Submit",
  visible: true,
  children: [],
  geometry: { x: 0, y: 0, width: 120, height: 40 },
  appearance,
  component: { key: "button-key", variant: "Primary" },
  source: { provider: "pixso", nodeId: "4:341" },
};

describe("exact component recognition", () => {
  it("prefers an exact key and variant mapping", () => {
    const mappings: PixsoSemanticMapping[] = [
      { componentKey: "button-key", kind: "action", role: "secondaryAction" },
      {
        componentKey: "button-key",
        variant: "Primary",
        kind: "action",
        role: "primaryAction",
      },
    ];

    expect(createExactComponentRecognizer(mappings).match(instance)).toEqual({
      mapping: mappings[1],
      recognition: {
        kind: "action",
        role: "primaryAction",
        confidence: 1,
        evidence: [
          { kind: "component-key", value: "button-key", weight: 1 },
          { kind: "component-variant", value: "Primary", weight: 1 },
          { kind: "source-node", value: "4:341" },
        ],
        sourceNodeIds: ["4:341"],
      },
    });
  });

  it("does not apply a mapping with the wrong explicit variant", () => {
    const recognizer = createExactComponentRecognizer([
      {
        componentKey: "button-key",
        variant: "Secondary",
        kind: "action",
        role: "secondaryAction",
      },
    ]);

    expect(recognizer.match(instance)).toBeUndefined();
  });

  it("rejects duplicate key and variant mappings", () => {
    expect(() =>
      createExactComponentRecognizer([
        {
          componentKey: "button-key",
          variant: "Primary",
          kind: "action",
          role: "primaryAction",
        },
        {
          componentKey: "button-key",
          variant: "Primary",
          kind: "action",
          role: "submitAction",
        },
      ]),
    ).toThrowError(
      expect.objectContaining({ code: "SEMANTIC_MAPPING_CONFLICT" }),
    );
  });
});
