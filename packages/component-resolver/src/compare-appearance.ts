import type {
  DesignIR,
  DesignIRV2,
  DesignTokens,
  Diagnostic,
  UiManifest,
  UiManifestV2,
} from "@uig/contracts";

export function compareAppearance(input: {
  manifest: UiManifest | UiManifestV2;
  designIr: DesignIR | DesignIRV2;
  tokens: DesignTokens;
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const uiNode of flatten(input.manifest.root)) {
    for (const sourceNodeId of uiNode.sourceNodeIds) {
      const designNode = input.designIr.nodes[sourceNodeId];
      if (!designNode) {
        continue;
      }
      compare(
        diagnostics,
        uiNode.id,
        sourceNodeId,
        "fill.color",
        designNode.appearance.fills[0]?.color,
        "surface.default",
        input.tokens,
      );
      compare(
        diagnostics,
        uiNode.id,
        sourceNodeId,
        "border.color",
        designNode.appearance.borders[0]?.color,
        "border.default",
        input.tokens,
      );
      if (uiNode.role === "dialog") {
        compare(
          diagnostics,
          uiNode.id,
          sourceNodeId,
          "radii.topLeft",
          designNode.appearance.radii.topLeft,
          "radius.dialog",
          input.tokens,
        );
      }
    }
  }
  return diagnostics;
}

function compare(
  diagnostics: Diagnostic[],
  manifestNodeId: string,
  sourceNodeId: string,
  property: string,
  designValue: unknown,
  tokenName: string,
  tokens: DesignTokens,
): void {
  const token = tokens.tokens[tokenName];
  if (
    token === undefined ||
    designValue === undefined ||
    designValue === token.value
  ) {
    return;
  }
  diagnostics.push({
    severity: "warning",
    blocking: false,
    stage: "appearance-comparison",
    code: "VISUAL_TOKEN_MISMATCH",
    message: `${property} differs from design-system token ${tokenName}`,
    source: { nodeId: sourceNodeId, manifestNodeId },
    evidence: {
      property,
      designValue,
      tokenName,
      tokenValue: token.value,
    },
  });
}

type AppearanceManifestNode = UiManifest["root"] | UiManifestV2["root"];

function flatten(root: AppearanceManifestNode): AppearanceManifestNode[] {
  return [root, ...root.children.flatMap(flatten)];
}
