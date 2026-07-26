import type { DesignIR, UiManifest } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { compareAppearance } from "./compare-appearance.js";

describe("compareAppearance", () => {
  it("reports token mismatches without mutating design facts", () => {
    const ir = {
      schema: "design-ir/v1",
      sourceArtifactId: "artifact",
      dslVersion: "2.1.15",
      rootNodeId: "root",
      nodes: {
        root: {
          id: "root",
          type: "frame",
          name: "Dialog",
          visible: true,
          children: [],
          geometry: { x: 0, y: 0, width: 600, height: 400 },
          appearance: {
            fills: [{ type: "solid", color: "#FAFAFA", opacity: 1 }],
            borders: [],
            radii: {
              topLeft: 12,
              topRight: 12,
              bottomRight: 12,
              bottomLeft: 12,
            },
            shadows: [],
            opacity: 1,
          },
          source: { provider: "pixso", nodeId: "root" },
        },
      },
      diagnostics: [],
    } satisfies DesignIR;
    const manifest = {
      schema: "ui-manifest/v1",
      sourceArtifactId: "artifact",
      root: {
        id: "ui_dialog_root",
        kind: "overlay",
        role: "dialog",
        sourceNodeIds: ["root"],
        confidence: 1,
        evidence: [],
        children: [],
      },
      diagnostics: [],
    } satisfies UiManifest;
    const before = JSON.stringify(ir);

    const diagnostics = compareAppearance({
      manifest,
      designIr: ir,
      tokens: {
        schema: "design-tokens/v1",
        tokens: {
          "surface.default": { type: "color", value: "#FFFFFF" },
          "radius.dialog": { type: "dimension", value: 4, unit: "px" },
        },
      },
    });

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "VISUAL_TOKEN_MISMATCH",
        blocking: false,
        evidence: expect.objectContaining({
          property: "fill.color",
          designValue: "#FAFAFA",
          tokenName: "surface.default",
          tokenValue: "#FFFFFF",
        }),
      }),
    );
    expect(JSON.stringify(ir)).toBe(before);
  });
});
