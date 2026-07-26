import type {
  DesignNodeV2,
  ReactStylePolicy,
  ResolutionNode,
  UiNodeV2,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { ReactGenerationError } from "./errors.js";
import { buildFallbackModel } from "./build-fallback-model.js";

describe("buildFallbackModel", () => {
  it("builds stable local component and CSS class names for a permitted fallback", () => {
    const model = buildFallbackModel({
      node: node("ui_warning"),
      designNode: designNode(),
      resolution: fallbackResolution("GeneratedWarning"),
      policy: policy(),
    });

    expect(model.localComponentName).toBe("GeneratedWarning");
    expect(model.className).toBe("ui_warning");
  });

  it("rejects a reuse or compose decision at the fallback-only boundary", () => {
    expect(() =>
      buildFallbackModel({
        node: node("ui_warning"),
        designNode: designNode(),
        resolution: {
          ...resolutionBase(),
          decision: "reuse",
          binding: {
            componentId: "base.Warning",
            package: "@test/ui",
            export: "Warning",
            exportKind: "named",
          },
          props: {},
        },
        policy: policy(),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_FALLBACK_FORBIDDEN",
      }),
    );
  });

  it("rejects a fallback when its pack policy is not approved", () => {
    const unapproved = policy();
    (
      unapproved as unknown as {
        fallback: { layout: string; appearance: string };
      }
    ).fallback = { layout: "forbidden", appearance: "forbidden" };

    expect(() =>
      buildFallbackModel({
        node: node("ui_warning"),
        designNode: designNode(),
        resolution: fallbackResolution("GeneratedWarning"),
        policy: unapproved,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_FALLBACK_FORBIDDEN",
      }),
    );
  });
});

function node(id: string): UiNodeV2 {
  return {
    id,
    kind: "group",
    role: "content",
    sourceNodeIds: ["source"],
    layoutSourceNodeId: "source",
    confidence: 1,
    evidence: [],
    children: [],
  };
}

function designNode(): DesignNodeV2 {
  return {
    id: "source",
    type: "frame",
    name: "source",
    visible: true,
    children: [],
    geometry: { x: 0, y: 0, width: 100, height: 40 },
    appearance: {
      fills: [],
      borders: [],
      radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      shadows: [],
      opacity: 1,
    },
    source: { provider: "pixso", nodeId: "source" },
  };
}

function fallbackResolution(localComponentName: string): ResolutionNode {
  return {
    ...resolutionBase(),
    decision: "fallback",
    localComponentName,
    styleStrategy: "css-module",
  };
}

function resolutionBase() {
  return {
    manifestNodeId: "ui_warning",
    semanticRole: "content",
    confidence: 1,
    evidence: [],
    diagnosticCodes: [],
  };
}

function policy(): ReactStylePolicy {
  return {
    schema: "react-style-policy/v1",
    defaults: {
      layout: { allowed: [] },
      appearance: { allowed: [] },
      internalSelectors: false,
      inlineStyles: false,
    },
    components: [],
    fallback: { layout: "all-supported", appearance: "all-supported" },
    provenance: { kind: "test", source: "fallback fixture" },
  };
}
