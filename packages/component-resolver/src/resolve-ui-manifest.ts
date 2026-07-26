import type { LoadedDesignSystemPack } from "@uig/component-catalog";
import {
  ResolutionPlanSchema,
  type DesignIR,
  type ResolutionPlan,
  type UiManifest,
  validateWithSchema,
} from "@uig/contracts";

import { compareAppearance } from "./compare-appearance.js";
import { resolveNode } from "./resolve-node.js";

export function resolveUiManifest(input: {
  manifest: UiManifest;
  designIr: DesignIR;
  pack: LoadedDesignSystemPack;
}): ResolutionPlan {
  const semanticNodes = flatten(input.manifest.root);
  const results = semanticNodes.map((node) =>
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

  return validateWithSchema(ResolutionPlanSchema, {
    schema: "resolution-plan/v1",
    sourceManifestId: input.manifest.sourceArtifactId,
    target: {
      framework: "react",
      language: "typescript",
      designSystem: input.pack.manifest.id,
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
}

function flatten(root: UiManifest["root"]): UiManifest["root"][] {
  return [root, ...root.children.flatMap(flatten)];
}
