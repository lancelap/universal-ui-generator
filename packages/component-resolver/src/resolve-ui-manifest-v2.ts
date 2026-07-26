import type { LoadedDesignSystemPackV2 } from "@uig/component-catalog";
import {
  type DesignIRV2,
  type ResolutionPlanV2,
  ResolutionPlanV2Schema,
  type UiManifestV2,
  assertResolutionPlanV2Integrity,
  validateWithSchema,
} from "@uig/contracts";

import { compareAppearance } from "./compare-appearance.js";
import { hashResolutionSource } from "./hash-resolution-source.js";
import { resolveNode } from "./resolve-node.js";

export function resolveUiManifestV2(input: {
  manifest: UiManifestV2;
  designIr: DesignIRV2;
  pack: LoadedDesignSystemPackV2;
}): ResolutionPlanV2 {
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

function flatten(root: UiManifestV2["root"]): UiManifestV2["root"][] {
  return [root, ...root.children.flatMap(flatten)];
}
