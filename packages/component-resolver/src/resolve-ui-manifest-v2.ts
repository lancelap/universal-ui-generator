import type { LoadedDesignSystemPackV2 } from "@uig/component-catalog";
import {
  type ChoicePanelContent,
  type ComponentBinding,
  type DesignIRV2,
  type Diagnostic,
  type ResolutionPlanV2,
  type UiNodeV2,
  ResolutionPlanV2Schema,
  type UiManifestV2,
  assertResolutionPlanV2Integrity,
  validateWithSchema,
} from "@uig/contracts";

import { compareAppearance } from "./compare-appearance.js";
import { hashResolutionSource } from "./hash-resolution-source.js";
import { resolveNode, type NodeResolutionResult } from "./resolve-node.js";

export function resolveUiManifestV2(input: {
  manifest: UiManifestV2;
  designIr: DesignIRV2;
  pack: LoadedDesignSystemPackV2;
}): ResolutionPlanV2 {
  const semanticNodes = flatten(input.manifest.root);
  const results = semanticNodes.map(
    (node) =>
      resolveSingleSelectionCollection(node, input.pack) ??
      resolveNode({ node, pack: input.pack }),
  );
  const nodes = results.map((result) => result.resolution);
  const diagnostics = [
    ...input.manifest.diagnostics,
    ...results.flatMap((result) => result.diagnostics),
    ...compareAppearance({
      manifest: input.manifest,
      designIr: input.designIr,
      tokens: input.pack.tokens,
    }),
  ];

  const plan = validateWithSchema(ResolutionPlanV2Schema, {
    schema: "resolution-plan/v2",
    source: {
      designIr: {
        artifactId: input.designIr.sourceArtifactId,
        schema: "design-ir/v2",
        sha256: hashResolutionSource(input.designIr),
      },
      uiManifest: {
        artifactId: input.manifest.sourceArtifactId,
        schema: "ui-manifest/v2",
        sha256: hashResolutionSource(input.manifest),
      },
    },
    target: {
      framework: "react",
      language: "typescript",
      designSystem: input.pack.manifest.id,
      designSystemVersion: input.pack.manifest.version,
      packSha256: input.pack.sha256,
    },
    nodes,
    diagnostics,
    summary: {
      reuse: nodes.filter((node) => node.decision === "reuse").length,
      compose: nodes.filter((node) => node.decision === "compose").length,
      fallback: nodes.filter((node) => node.decision === "fallback").length,
      blocked: nodes.filter((node) => node.decision === "blocked").length,
    },
  });
  assertResolutionPlanV2Integrity(plan);
  return plan;
}

function resolveSingleSelectionCollection(
  node: UiNodeV2,
  pack: LoadedDesignSystemPackV2,
): NodeResolutionResult | undefined {
  if (node.role !== "choicePanel") {
    return undefined;
  }
  const recipe = pack.reactRenderRecipes.singleSelectionCollections?.find(
    (candidate) => candidate.semanticRole === node.role,
  );
  const policy = pack.semanticPolicy.roles[node.role];
  if (
    !recipe ||
    !policy ||
    !policy.allowedDecisions.includes("compose") ||
    !policy.candidateComponentIds.includes(recipe.rootComponentId)
  ) {
    return blockedChoice(
      node,
      "CHOICE_CONTROL_RESOLUTION_BLOCKED",
      "No complete structured choice control recipe is permitted",
    );
  }

  const requiredIds = [
    recipe.rootComponentId,
    recipe.optionComponentId,
    recipe.layoutComponentId,
    recipe.titleComponentId,
    recipe.descriptionComponentId,
  ];
  const requiredBindings: ComponentBinding[] = [];
  for (const componentId of requiredIds) {
    const component = pack.componentsById.get(componentId);
    if (!component || !isVerified(componentId, pack)) {
      const descriptionMissing = componentId === recipe.descriptionComponentId;
      return blockedChoice(
        node,
        descriptionMissing
          ? "CHOICE_DESCRIPTION_COMPANION_BLOCKED"
          : "CHOICE_CONTROL_RESOLUTION_BLOCKED",
        `Required structured choice component ${componentId} is unavailable`,
      );
    }
    requiredBindings.push(toBinding(component));
  }

  const diagnostics: Diagnostic[] = [];
  const optionalBindings: ComponentBinding[] = [];
  const content = node.content as ChoicePanelContent;
  const requestedOptional = [
    {
      requested: content.headerIcon !== undefined,
      componentId: recipe.leadingAssetComponentId,
      slot: "leading",
    },
    {
      requested: content.sections.some((section) =>
        section.options.some((option) => option.info?.present === true),
      ),
      componentId: recipe.trailingAssetComponentId,
      slot: "trailing",
    },
  ];
  for (const optional of requestedOptional) {
    if (!optional.requested) {
      continue;
    }
    const component = optional.componentId
      ? pack.componentsById.get(optional.componentId)
      : undefined;
    if (
      !optional.componentId ||
      !component ||
      !isVerified(optional.componentId, pack)
    ) {
      diagnostics.push({
        severity: "warning",
        blocking: false,
        stage: "component-resolution",
        code: "CHOICE_ICON_UNRESOLVED",
        message: `Optional ${optional.slot} choice icon is unavailable`,
        source: { manifestNodeId: node.id },
        evidence: {
          semanticRole: node.role,
          slot: optional.slot,
          componentId: optional.componentId ?? "none",
        },
      });
      continue;
    }
    optionalBindings.push(toBinding(component));
  }

  return {
    resolution: {
      ...resolutionBase(node),
      decision: "compose",
      bindings: [...requiredBindings, ...optionalBindings],
      props: pack.componentsById.get(recipe.rootComponentId)!.defaultProps,
    },
    diagnostics,
  };
}

function blockedChoice(
  node: UiNodeV2,
  code: string,
  message: string,
): NodeResolutionResult {
  return {
    resolution: {
      ...resolutionBase(node),
      decision: "blocked",
      diagnosticCodes: [code],
    },
    diagnostics: [
      {
        severity: "error",
        blocking: true,
        stage: "component-resolution",
        code,
        message,
        source: { manifestNodeId: node.id },
        evidence: { semanticRole: node.role },
      },
    ],
  };
}

function resolutionBase(node: UiNodeV2) {
  return {
    manifestNodeId: node.id,
    semanticRole: node.role,
    confidence: node.confidence,
    evidence: [...node.evidence, { kind: "semantic-role", value: node.role }],
    diagnosticCodes: [] as string[],
  };
}

function isVerified(
  componentId: string,
  pack: LoadedDesignSystemPackV2,
): boolean {
  return (
    pack.componentsById.get(componentId)?.verified === true &&
    pack.verification.components.some(
      (entry) =>
        entry.componentId === componentId && entry.status === "verified",
    )
  );
}

function toBinding(component: {
  id: string;
  package: string;
  export: string;
  exportKind: "named" | "default";
}): ComponentBinding {
  return {
    componentId: component.id,
    package: component.package,
    export: component.export,
    exportKind: component.exportKind,
  };
}

function flatten(root: UiManifestV2["root"]): UiManifestV2["root"][] {
  return [root, ...root.children.flatMap(flatten)];
}
