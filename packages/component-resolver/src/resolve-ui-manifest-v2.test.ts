import {
  loadDesignSystemPackV2,
  type LoadedDesignSystemPackV2,
} from "@uig/component-catalog";
import {
  type DesignIRV2,
  stableStringify,
  type UiManifestV2,
} from "@uig/contracts";
import { sha256 } from "@uig/design-context";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveUiManifestV2 } from "./resolve-ui-manifest-v2.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

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

  it("resolves a choice panel as one complete structured composition", async () => {
    const pack = await loadDesignSystemPackV2(
      join(repoRoot, "design-system-packs", "sber-space-ui"),
    );

    const plan = resolveUiManifestV2({
      manifest: choicePanelManifest(),
      designIr,
      pack,
    });

    expect(plan.summary).toEqual({
      reuse: 0,
      compose: 1,
      fallback: 0,
      blocked: 0,
    });
    expect(plan.nodes[0]).toMatchObject({
      decision: "compose",
      bindings: expect.arrayContaining(
        [
          "base.RadioGroup",
          "base.RadioButton",
          "base.Stack",
          "base.Typography",
          "base.FormDescription",
          "icon.DocumentText",
          "icon.ExclamationMarkInfo",
        ].map((componentId) => expect.objectContaining({ componentId })),
      ),
    });
    expect(plan.diagnostics).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ blocking: true })]),
    );
  });

  it.each([
    ["base.RadioButton", "CHOICE_CONTROL_RESOLUTION_BLOCKED"],
    ["base.FormDescription", "CHOICE_DESCRIPTION_COMPANION_BLOCKED"],
  ] as const)(
    "blocks a choice panel when required binding %s is unavailable",
    async (componentId, code) => {
      const pack = await choicePanelPackWithout(componentId);

      const plan = resolveUiManifestV2({
        manifest: choicePanelManifest(),
        designIr,
        pack,
      });

      expect(plan.summary.blocked).toBe(1);
      expect(plan.summary.fallback).toBe(0);
      expect(plan.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code, blocking: true }),
        ]),
      );
    },
  );

  it("warns and omits only a requested optional icon binding", async () => {
    const pack = await choicePanelPackWithout("icon.ExclamationMarkInfo");

    const plan = resolveUiManifestV2({
      manifest: choicePanelManifest(),
      designIr,
      pack,
    });

    expect(plan.summary.compose).toBe(1);
    expect(plan.summary.blocked).toBe(0);
    expect(plan.nodes[0]).toMatchObject({
      decision: "compose",
      bindings: expect.not.arrayContaining([
        expect.objectContaining({ componentId: "icon.ExclamationMarkInfo" }),
      ]),
    });
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CHOICE_ICON_UNRESOLVED",
          blocking: false,
        }),
      ]),
    );
  });
});

function choicePanelManifest(): UiManifestV2 {
  return {
    schema: "ui-manifest/v2",
    sourceArtifactId: designIr.sourceArtifactId,
    root: {
      id: "ui_choicePanel_4-314",
      kind: "control",
      role: "choicePanel",
      sourceNodeIds: ["4:314"],
      layoutSourceNodeId: "4:314",
      confidence: 1,
      evidence: [{ kind: "structural-pattern", value: "choice-panel" }],
      content: {
        title: "Choose",
        titleSourceNodeId: "4:314",
        headerIcon: { hint: "files", sourceNodeId: "4:314" },
        sections: [
          {
            id: "section-1",
            options: [
              {
                id: "option-1",
                sourceNodeIds: ["4:314"],
                label: "First",
                labelSourceNodeId: "4:314",
                info: {
                  present: true,
                  hint: "information",
                  sourceNodeId: "4:314",
                },
                selected: false,
              },
              {
                id: "option-2",
                sourceNodeIds: ["4:314"],
                label: "Second",
                labelSourceNodeId: "4:314",
                selected: false,
              },
            ],
          },
        ],
      },
      state: { selectionMode: "single", selectedOptionId: null },
      children: [],
    },
    diagnostics: [],
  };
}

async function choicePanelPackWithout(
  componentId: string,
): Promise<LoadedDesignSystemPackV2> {
  const pack = await loadDesignSystemPackV2(
    join(repoRoot, "design-system-packs", "sber-space-ui"),
  );
  const componentsById = new Map(pack.componentsById);
  componentsById.delete(componentId);
  return {
    ...pack,
    componentsById,
    candidatesByRole: new Map(
      [...pack.candidatesByRole].map(([role, components]) => [
        role,
        components.filter((component) => component.id !== componentId),
      ]),
    ),
    verification: {
      ...pack.verification,
      components: pack.verification.components.filter(
        (entry) => entry.componentId !== componentId,
      ),
    },
  };
}

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
