import minimalDesignIr from "../../design-normalizer/src/__fixtures__/minimal-design-ir.json";

import type { DesignIR } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { buildUiManifest } from "./build-ui-manifest.js";

describe("buildUiManifest", () => {
  it("assembles a deterministic design-system-neutral semantic tree", () => {
    const manifest = buildUiManifest({
      ir: minimalDesignIr as DesignIR,
      exactMappings: [
        {
          componentKey: "Button/Primary",
          variant: "size=m",
          kind: "action",
          role: "primaryAction",
        },
      ],
    });

    expect(manifest.schema).toBe("ui-manifest/v1");
    expect(manifest.sourceArtifactId).toBe("pixso_doc_4_314_0123456789ab");
    expect(manifest.root.sourceNodeIds).toEqual(["4:314", "4:315", "4:316"]);
    expect(JSON.stringify(manifest)).not.toMatch(
      /@sber|@mui|package|import|componentId/,
    );

    const primary = findRole(manifest.root, "primaryAction");
    expect(primary).toMatchObject({
      id: "ui_primaryAction_4-316",
      kind: "action",
      confidence: 1,
      sourceNodeIds: ["4:316"],
    });
  });

  it("emits a blocking diagnostic instead of guessing a decorative frame", () => {
    const design = structuredClone(minimalDesignIr) as DesignIR;
    design.nodes["4:314"]!.name = "Rectangle";
    delete design.nodes["4:314"]!.layout;
    design.nodes["4:314"]!.appearance = {
      ...design.nodes["4:314"]!.appearance,
      shadows: [],
    };

    const manifest = buildUiManifest({ ir: design, exactMappings: [] });

    expect(manifest.root).toMatchObject({
      kind: "unresolved",
      role: "unresolved",
    });
    expect(manifest.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SEMANTIC_CONFIDENCE_TOO_LOW",
        blocking: true,
        source: { artifactId: design.sourceArtifactId, nodeId: "4:314" },
      }),
    );
  });
});

function findRole(
  root: ReturnType<typeof buildUiManifest>["root"],
  role: string,
): ReturnType<typeof buildUiManifest>["root"] | undefined {
  if (root.role === role) {
    return root;
  }
  for (const child of root.children) {
    const found = findRole(child, role);
    if (found) {
      return found;
    }
  }
  return undefined;
}
