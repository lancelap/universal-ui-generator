import type { LoadedDesignSystemPackV2 } from "@uig/component-catalog";
import {
  type DesignIRV2,
  stableStringify,
  type UiManifestV2,
} from "@uig/contracts";
import { sha256 } from "@uig/design-context";
import { describe, expect, it } from "vitest";

import { resolveUiManifestV2 } from "./resolve-ui-manifest-v2.js";

const designIr: DesignIRV2 = {
  schema: "design-ir/v2",
  sourceArtifactId: "pixso_doc_4_314_0123456789ab",
  dslVersion: "2.1.15",
  rootNodeId: "4:314",
  nodes: {
    "4:314": {
      id: "4:314",
      type: "instance",
      name: "Primary action",
      visible: true,
      children: [],
      geometry: { x: 0, y: 0, width: 120, height: 40 },
      appearance: {
        fills: [],
        borders: [],
        radii: {
          topLeft: 0,
          topRight: 0,
          bottomRight: 0,
          bottomLeft: 0,
        },
        shadows: [],
        opacity: 1,
      },
      source: { provider: "pixso", nodeId: "4:314" },
    },
  },
  diagnostics: [],
};

const manifest: UiManifestV2 = {
  schema: "ui-manifest/v2",
  sourceArtifactId: designIr.sourceArtifactId,
  root: {
    id: "ui_primaryAction_4-314",
    kind: "action",
    role: "primaryAction",
    sourceNodeIds: ["4:314"],
    layoutSourceNodeId: "4:314",
    confidence: 1,
    evidence: [{ kind: "exact-component", value: "Button/Primary" }],
    content: { label: "Continue" },
    interactions: [
      { key: "primaryAction", event: "activate", valueType: "void" },
    ],
    children: [],
  },
  diagnostics: [],
};

describe("resolveUiManifestV2", () => {
  it("binds exact source and pack proofs while preserving decisions", () => {
    const sber = packFixture(
      "sber-space-ui",
      "@sber-space-ui/button",
      "content.label",
    );
    const mui = packFixture("material-ui", "@mui/material", "content.label");

    const sberPlan = resolveUiManifestV2({
      manifest,
      designIr,
      pack: sber,
    });
    const muiPlan = resolveUiManifestV2({
      manifest,
      designIr,
      pack: mui,
    });

    expect(sberPlan.source.designIr.sha256).toBe(
      sha256(stableStringify(designIr)),
    );
    expect(sberPlan.source.uiManifest.sha256).toBe(
      sha256(stableStringify(manifest)),
    );
    expect(sberPlan.target).toEqual({
      framework: "react",
      language: "typescript",
      designSystem: "sber-space-ui",
      designSystemVersion: "2.0.0",
      packSha256: sber.sha256,
    });
    expect(sberPlan.nodes.map((node) => node.decision)).toEqual(["reuse"]);
    expect(muiPlan.nodes.map((node) => node.decision)).toEqual(["reuse"]);
    expect(sberPlan.nodes[0]).not.toEqual(muiPlan.nodes[0]);
  });

  it("changes only the manifest source proof for a manifest-only change", () => {
    const pack = packFixture(
      "sber-space-ui",
      "@sber-space-ui/button",
      "content.label",
    );
    const first = resolveUiManifestV2({ manifest, designIr, pack });
    const changedManifest = structuredClone(manifest);
    changedManifest.root.content = { label: "Continue now" };
    const second = resolveUiManifestV2({
      manifest: changedManifest,
      designIr,
      pack,
    });

    expect(second.source.designIr).toEqual(first.source.designIr);
    expect(second.source.uiManifest.sha256).not.toBe(
      first.source.uiManifest.sha256,
    );
    expect(second.target).toEqual(first.target);
  });

  it("changes the pack proof for a recipe-only change", () => {
    const firstPack = packFixture(
      "sber-space-ui",
      "@sber-space-ui/button",
      "content.label",
    );
    const secondPack = packFixture(
      "sber-space-ui",
      "@sber-space-ui/button",
      "content.text",
    );
    const first = resolveUiManifestV2({
      manifest,
      designIr,
      pack: firstPack,
    });
    const second = resolveUiManifestV2({
      manifest,
      designIr,
      pack: secondPack,
    });

    expect(second.target.packSha256).not.toBe(first.target.packSha256);
    expect(second.nodes).toEqual(first.nodes);
    expect(second.source).toEqual(first.source);
  });
});

function packFixture(
  id: string,
  packageName: string,
  contentSource: "content.label" | "content.text",
): LoadedDesignSystemPackV2 {
  const componentId = `${id}.Button`;
  const component = {
    id: componentId,
    package: packageName,
    export: "Button",
    exportKind: "named" as const,
    semanticRoles: ["primaryAction"],
    capabilities: ["label", "click"],
    formAdapters: [],
    priority: 100,
    verified: true,
    requiredComponentIds: [],
    optionalComponentIds: [],
    defaultProps: {},
    provenance: { kind: "test", source: "resolver fixture" },
  };
  const manifestDocument = {
    schema: "design-system-pack/v2" as const,
    id,
    name: id,
    version: "2.0.0",
    framework: "react" as const,
    files: {
      catalog: "catalog.json",
      semanticPolicy: "semantic-policy.json",
      pixsoMap: "pixso-map.json",
      compositionRules: "composition-rules.json",
      tokens: "tokens.json",
      verification: "verification.json",
      reactRenderRecipes: "react-render-recipes.json",
      reactStylePolicy: "react-style-policy.json",
    },
  };
  const reactRenderRecipes = {
    schema: "react-render-recipes/v2" as const,
    components: [
      {
        componentId,
        content: { source: contentSource, target: "children" },
        staticProps: [],
        stateProps: [],
        eventProps: [{ source: "activate" as const, target: "onClick" }],
        classNameProp: "className",
        semanticChildrenPolicy: "forbidden" as const,
        wrapper: "allowed" as const,
        provenance: { kind: "test", source: "resolver fixture" },
      },
    ],
    compositions: [],
  };
  const reactStylePolicy = {
    schema: "react-style-policy/v1" as const,
    defaults: {
      layout: { allowed: [] },
      appearance: { allowed: [] },
      internalSelectors: false as const,
      inlineStyles: false as const,
    },
    components: [],
    fallback: {
      layout: "all-supported" as const,
      appearance: "all-supported" as const,
    },
    provenance: { kind: "test", source: "resolver fixture" },
  };

  return {
    manifest: manifestDocument,
    componentsById: new Map([[componentId, component]]),
    candidatesByRole: new Map([["primaryAction", [component]]]),
    semanticPolicy: {
      schema: "semantic-policy/v1",
      roles: {
        primaryAction: {
          allowedDecisions: ["reuse"],
          candidateComponentIds: [componentId],
          nativeFallback: false,
          unresolvedCode: "COMPONENT_UNRESOLVED",
        },
      },
    },
    exactPixsoMappings: [],
    compositionRules: { schema: "composition-rules/v1", rules: [] },
    tokens: { schema: "design-tokens/v1", tokens: {} },
    verification: {
      schema: "component-verification/v1",
      components: [
        { componentId, status: "verified", source: "resolver fixture" },
      ],
    },
    reactRenderRecipes,
    reactStylePolicy,
    sha256: sha256(
      stableStringify({
        manifest: manifestDocument,
        reactRenderRecipes,
        reactStylePolicy,
      }),
    ),
  };
}
