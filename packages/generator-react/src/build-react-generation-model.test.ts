import type { LoadedDesignSystemPackV2 } from "@uig/component-catalog";
import type {
  ComponentBinding,
  DesignIRV2,
  ReactComponentRecipeV1,
  ResolutionNode,
  ResolutionPlanV2,
  UiManifestV2,
  UiNodeV2,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { ReactGenerationError } from "./errors.js";
import type { ReadyGenerationInput } from "./generation-model.js";
import { buildReactGenerationModel } from "./build-react-generation-model.js";

describe("buildReactGenerationModel", () => {
  it("lowers one manifest tree to one nested reuse element tree", () => {
    const root = node("root", "verticalGroup", [
      node("action", "primaryAction", [], { label: "Continue" }),
    ]);
    const input = readyInput({
      root,
      resolutions: [
        reuse("root", "verticalGroup", "base.Stack", "Stack"),
        reuse("action", "primaryAction", "base.Button", "Button"),
      ],
      recipes: [
        recipe("base.Stack", "required"),
        recipe("base.Button", "forbidden", {
          content: { source: "content.label", target: "children" },
        }),
      ],
    });

    const model = buildReactGenerationModel(input);

    expect(model.root.kind).toBe("reuse");
    expect(model.root.children).toHaveLength(1);
    expect(model.root.children[0]).toMatchObject({
      kind: "reuse",
      nodeId: "action",
      componentId: "base.Button",
      textChild: { kind: "text", value: "Continue" },
    });
  });

  it.each([
    ["reuse", reuse("root", "content", "base.Content", "Content")],
    [
      "fallback",
      {
        ...resolutionBase("root", "content"),
        decision: "fallback",
        localComponentName: "GeneratedContent",
        styleStrategy: "css-module",
      } satisfies ResolutionNode,
    ],
  ] as const)(
    "retains the %s decision as a distinct model kind",
    (kind, result) => {
      const input = readyInput({
        root: node("root", "content", []),
        resolutions: [result],
        recipes: kind === "reuse" ? [recipe("base.Content", "optional")] : [],
        fallbackAllowed: true,
      });

      expect(buildReactGenerationModel(input).root.kind).toBe(kind);
    },
  );

  it("builds a composition root with recipe-defined slots", () => {
    const root = node("dialog", "dialog", [
      node("title", "heading", [], { text: "Title" }),
      node("body", "content", [], { text: "Body" }),
      node("actions", "actionGroup", [
        node("confirm", "primaryAction", [], { label: "Confirm" }),
      ]),
    ]);
    const bindings = [
      binding("mui.Dialog", "Dialog"),
      binding("mui.DialogTitle", "DialogTitle"),
      binding("mui.DialogContent", "DialogContent"),
      binding("mui.DialogActions", "DialogActions"),
    ];
    const input = readyInput({
      root,
      resolutions: [
        compose("dialog", "dialog", bindings),
        reuse("title", "heading", "mui.Typography", "Typography"),
        reuse("body", "content", "mui.Typography", "Typography"),
        reuse("actions", "actionGroup", "mui.Stack", "Stack"),
        reuse("confirm", "primaryAction", "mui.Button", "Button"),
      ],
      recipes: [
        recipe("mui.Dialog", "required"),
        recipe("mui.DialogTitle", "optional"),
        recipe("mui.DialogContent", "required"),
        recipe("mui.DialogActions", "required"),
        recipe("mui.Typography", "forbidden", {
          content: { source: "content.text", target: "children" },
        }),
        recipe("mui.Stack", "required"),
        recipe("mui.Button", "forbidden", {
          content: { source: "content.label", target: "children" },
        }),
      ],
      composition: true,
    });

    const model = buildReactGenerationModel(input);

    expect(model.root).toMatchObject({
      kind: "compose",
      componentId: "mui.Dialog",
      slots: [
        { name: "heading", children: [{ nodeId: "title" }] },
        { name: "body", children: [{ nodeId: "body" }] },
        { name: "actions", children: [{ nodeId: "actions" }] },
      ],
    });
  });

  it.each([
    [
      "forbidden semantic children",
      node("root", "primaryAction", [node("nested", "content", [])], {
        label: "Continue",
      }),
      recipe("base.Button", "forbidden", {
        content: { source: "content.label", target: "children" },
      }),
      "base.Button",
      "Button",
    ],
    [
      "missing required semantic children",
      node("root", "actionGroup", []),
      recipe("base.Stack", "required"),
      "base.Stack",
      "Stack",
    ],
  ])("rejects %s", (_, root, componentRecipe, componentId, exportName) => {
    const resolutions = [
      reuse("root", root.role, componentId, exportName),
      ...root.children.map((child) =>
        reuse(child.id, child.role, "base.Content", "Content"),
      ),
    ];
    const recipes = [
      componentRecipe,
      ...(root.children.length > 0 ? [recipe("base.Content", "optional")] : []),
    ];

    expect(() =>
      buildReactGenerationModel(readyInput({ root, resolutions, recipes })),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_INPUT_INCOMPLETE",
      }),
    );
  });

  it.each([
    ["allowed", "allowed", "intrinsic-wrapper"],
    ["forbidden", "allowed", "reuse"],
    ["allowed", "forbidden", "reuse"],
  ] as const)(
    "uses a wrapper only when recipe=%s and style policy=%s",
    (recipeWrapper, styleWrapper, expectedKind) => {
      const root = node("root", "content", []);
      const input = readyInput({
        root,
        resolutions: [reuse("root", "content", "base.Content", "Content")],
        recipes: [
          recipe("base.Content", "optional", {
            wrapper: recipeWrapper,
          }),
        ],
        styleWrapper,
        withLayout: true,
      });

      expect(buildReactGenerationModel(input).root.kind).toBe(expectedKind);
    },
  );
});

function readyInput(input: {
  root: UiNodeV2;
  resolutions: ResolutionNode[];
  recipes: ReactComponentRecipeV1[];
  composition?: boolean;
  fallbackAllowed?: boolean;
  styleWrapper?: "allowed" | "forbidden";
  withLayout?: boolean;
}): ReadyGenerationInput {
  const designNodes = Object.fromEntries(
    flatten(input.root).map((semanticNode) => [
      semanticNode.layoutSourceNodeId,
      designNode(
        semanticNode.layoutSourceNodeId,
        input.withLayout && semanticNode.id === input.root.id,
      ),
    ]),
  );
  const designIr: DesignIRV2 = {
    schema: "design-ir/v2",
    sourceArtifactId: "fixture",
    dslVersion: "2",
    rootNodeId: input.root.layoutSourceNodeId,
    nodes: designNodes,
    diagnostics: [],
  };
  const uiManifest: UiManifestV2 = {
    schema: "ui-manifest/v2",
    sourceArtifactId: "fixture",
    root: input.root,
    diagnostics: [],
  };
  const pack = packFixture(input);
  const resolutionPlan = {
    schema: "resolution-plan/v2",
    source: {
      designIr: {
        artifactId: "fixture",
        schema: "design-ir/v2",
        sha256: "a".repeat(64),
      },
      uiManifest: {
        artifactId: "fixture",
        schema: "ui-manifest/v2",
        sha256: "b".repeat(64),
      },
    },
    target: {
      framework: "react",
      language: "typescript",
      designSystem: "test",
      designSystemVersion: "2.0.0",
      packSha256: pack.sha256,
    },
    nodes: input.resolutions,
    diagnostics: [],
    summary: {
      reuse: input.resolutions.filter((item) => item.decision === "reuse")
        .length,
      compose: input.resolutions.filter((item) => item.decision === "compose")
        .length,
      fallback: input.resolutions.filter((item) => item.decision === "fallback")
        .length,
      blocked: 0,
    },
  } satisfies ResolutionPlanV2;
  return {
    status: "ready",
    sourceRunId: "run_fixture",
    designIr,
    uiManifest,
    resolutionPlan,
    pack,
    manifestNodes: flatten(input.root),
    resolutionsByManifestNodeId: new Map(
      input.resolutions.map((resolution) => [
        resolution.manifestNodeId,
        resolution,
      ]),
    ),
  };
}

function packFixture(input: {
  resolutions: ResolutionNode[];
  recipes: ReactComponentRecipeV1[];
  composition?: boolean;
  fallbackAllowed?: boolean;
  styleWrapper?: "allowed" | "forbidden";
}): LoadedDesignSystemPackV2 {
  const bindings = input.resolutions.flatMap((resolution) =>
    resolution.decision === "reuse"
      ? [resolution.binding]
      : resolution.decision === "compose"
        ? resolution.bindings
        : [],
  );
  const components = new Map(
    bindings.map((item) => [
      item.componentId,
      {
        id: item.componentId,
        package: item.package,
        export: item.export,
        exportKind: item.exportKind,
        semanticRoles: [],
        capabilities: [],
        formAdapters: [],
        priority: 0,
        verified: true,
        requiredComponentIds: [],
        optionalComponentIds: [],
        defaultProps: {},
        provenance: { kind: "test", source: "test fixture" },
      },
    ]),
  );
  return {
    manifest: {
      schema: "design-system-pack/v2",
      id: "test",
      name: "Test",
      version: "2.0.0",
      framework: "react",
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
    },
    componentsById: components,
    candidatesByRole: new Map(),
    semanticPolicy: { schema: "semantic-policy/v1", roles: {} },
    exactPixsoMappings: [],
    compositionRules: { schema: "composition-rules/v1", rules: [] },
    tokens: { schema: "design-tokens/v1", tokens: {} },
    verification: { schema: "component-verification/v1", components: [] },
    reactRenderRecipes: {
      schema: "react-render-recipes/v1",
      components: input.recipes,
      compositions: input.composition
        ? [
            {
              compositionId: "test-dialog",
              rootComponentId: "mui.Dialog",
              slots: [
                {
                  name: "heading",
                  componentId: "mui.DialogTitle",
                  acceptsRoles: ["heading"],
                  cardinality: "zero-or-one",
                },
                {
                  name: "body",
                  componentId: "mui.DialogContent",
                  acceptsRemaining: true,
                  cardinality: "many",
                },
                {
                  name: "actions",
                  componentId: "mui.DialogActions",
                  acceptsRoles: ["actionGroup"],
                  cardinality: "zero-or-one",
                },
              ],
              provenance: { kind: "test", source: "test fixture" },
            },
          ]
        : [],
    },
    reactStylePolicy: {
      schema: "react-style-policy/v1",
      defaults: {
        layout: { allowed: [] },
        appearance: { allowed: [] },
        internalSelectors: false,
        inlineStyles: false,
      },
      components: bindings.map((item) => ({
        componentId: item.componentId,
        layout: { allowed: [] },
        appearance: { allowed: [] },
        wrapper: input.styleWrapper ?? "forbidden",
      })),
      fallback: {
        layout: input.fallbackAllowed ? "all-supported" : "all-supported",
        appearance: input.fallbackAllowed ? "all-supported" : "all-supported",
      },
      provenance: { kind: "test", source: "test fixture" },
    },
    sha256: "c".repeat(64),
  };
}

function node(
  id: string,
  role: string,
  children: UiNodeV2[],
  content?: Record<string, unknown>,
): UiNodeV2 {
  return {
    id,
    kind: "group",
    role,
    sourceNodeIds: [`source-${id}`],
    layoutSourceNodeId: `source-${id}`,
    confidence: 1,
    evidence: [],
    ...(content ? { content } : {}),
    children,
  };
}

function designNode(
  id: string,
  withLayout = false,
): DesignIRV2["nodes"][string] {
  return {
    id,
    type: "frame",
    name: id,
    visible: true,
    children: [],
    geometry: { x: 0, y: 0, width: 100, height: 40 },
    ...(withLayout
      ? {
          layout: {
            mode: "vertical",
            gap: 8,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            alignItems: "stretch",
          },
        }
      : {}),
    appearance: {
      fills: [],
      borders: [],
      radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      shadows: [],
      opacity: 1,
    },
    source: { provider: "pixso", nodeId: id },
  };
}

function reuse(
  manifestNodeId: string,
  semanticRole: string,
  componentId: string,
  exportName: string,
): ResolutionNode {
  return {
    ...resolutionBase(manifestNodeId, semanticRole),
    decision: "reuse",
    binding: binding(componentId, exportName),
    props: {},
  };
}

function compose(
  manifestNodeId: string,
  semanticRole: string,
  bindings: ComponentBinding[],
): ResolutionNode {
  return {
    ...resolutionBase(manifestNodeId, semanticRole),
    decision: "compose",
    bindings,
    props: {},
  };
}

function resolutionBase(manifestNodeId: string, semanticRole: string) {
  return {
    manifestNodeId,
    semanticRole,
    confidence: 1,
    evidence: [],
    diagnosticCodes: [],
  };
}

function binding(componentId: string, exportName: string): ComponentBinding {
  return {
    componentId,
    package: "@test/ui",
    export: exportName,
    exportKind: "named",
  };
}

function recipe(
  componentId: string,
  semanticChildrenPolicy: ReactComponentRecipeV1["semanticChildrenPolicy"],
  overrides: Partial<ReactComponentRecipeV1> = {},
): ReactComponentRecipeV1 {
  return {
    componentId,
    stateProps: [],
    eventProps: [],
    semanticChildrenPolicy,
    wrapper: "forbidden",
    provenance: { kind: "test", source: "test fixture" },
    ...overrides,
  };
}

function flatten(root: UiNodeV2): UiNodeV2[] {
  return [root, ...root.children.flatMap(flatten)];
}
