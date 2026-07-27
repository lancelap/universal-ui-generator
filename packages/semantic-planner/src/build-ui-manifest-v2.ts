import {
  type DesignIRV2,
  type PixsoSemanticMapping,
  type UiManifestV2,
  type UiNodeV2,
  UiManifestV2Schema,
  assertUiManifestV2Integrity,
  validateWithSchema,
} from "@uig/contracts";

import { createExactComponentRecognizer } from "./exact-component-recognizer.js";
import { attachActivateInteractions } from "./interaction-recognizers.js";
import {
  confidencePolicy,
  recognizeStructure,
} from "./structural-recognizers.js";

export function buildUiManifestV2(input: {
  ir: DesignIRV2;
  exactMappings: PixsoSemanticMapping[];
}): UiManifestV2 {
  const exact = createExactComponentRecognizer(input.exactMappings);
  const diagnostics: UiManifestV2["diagnostics"] = [];
  const ids = new Map<string, number>();

  const build = (nodeId: string): UiNodeV2 => {
    const node = input.ir.nodes[nodeId];
    if (!node) {
      throw new Error(`Design node does not exist: ${nodeId}`);
    }
    const exactRecognition = exact.recognize(node);
    const recognized = exactRecognition ?? recognizeStructure(node, input.ir);
    const accepted =
      recognized && recognized.confidence >= confidencePolicy.warning;
    const role = accepted ? recognized.role : "unresolved";
    const directTextProjection =
      exactRecognition &&
      !node.text?.value &&
      (exactRecognition.kind === "content" ||
        exactRecognition.kind === "action")
        ? onlyVisibleDirectText(node.children, input.ir, exactRecognition.role)
        : undefined;
    const baseId = `ui_${role}_${sanitize(node.id)}`;
    const collision = (ids.get(baseId) ?? 0) + 1;
    ids.set(baseId, collision);

    if (!accepted) {
      diagnostics.push({
        severity: "error",
        blocking: true,
        stage: "semantic-planning",
        code: "SEMANTIC_CONFIDENCE_TOO_LOW",
        message: `No semantic role reached confidence ${confidencePolicy.warning}`,
        source: {
          artifactId: input.ir.sourceArtifactId,
          nodeId: node.id,
        },
        evidence: {
          confidence: recognized?.confidence ?? 0,
          candidateRole: recognized?.role ?? "none",
        },
      });
    } else if (recognized.confidence < confidencePolicy.automatic) {
      diagnostics.push({
        severity: "warning",
        blocking: false,
        stage: "semantic-planning",
        code: "SEMANTIC_ROLE_AMBIGUOUS",
        message: `Semantic role ${recognized.role} requires review`,
        source: {
          artifactId: input.ir.sourceArtifactId,
          nodeId: node.id,
        },
        evidence: {
          confidence: recognized.confidence,
          automaticThreshold: confidencePolicy.automatic,
        },
      });
    }

    return {
      id: collision === 1 ? baseId : `${baseId}_${collision}`,
      kind: accepted ? recognized.kind : "unresolved",
      role,
      sourceNodeIds: accepted
        ? [
            ...recognized.sourceNodeIds,
            ...(directTextProjection &&
            !recognized.sourceNodeIds.includes(directTextProjection.nodeId)
              ? [directTextProjection.nodeId]
              : []),
          ]
        : [node.id],
      layoutSourceNodeId: node.id,
      confidence: accepted
        ? recognized.confidence
        : (recognized?.confidence ?? 0),
      evidence: [
        ...(recognized?.evidence ?? []),
        ...(directTextProjection
          ? [
              {
                kind: "direct-text-source-node",
                value: directTextProjection.nodeId,
              },
              {
                kind: "direct-text-selection-rule",
                value: directTextProjection.rule,
              },
            ]
          : []),
      ],
      ...(node.text?.value || directTextProjection
        ? {
            content: {
              text: node.text?.value ?? directTextProjection!.text,
              label: node.text?.value ?? directTextProjection!.text,
            },
          }
        : {}),
      children: exactRecognition
        ? []
        : node.children.flatMap((childId) =>
            input.ir.nodes[childId] ? [build(childId)] : [],
          ),
    };
  };

  const root = build(input.ir.rootNodeId);
  attachActivateInteractions(root);
  const manifest = validateWithSchema(UiManifestV2Schema, {
    schema: "ui-manifest/v2",
    sourceArtifactId: input.ir.sourceArtifactId,
    root,
    diagnostics,
  });
  assertUiManifestV2Integrity(manifest, input.ir);
  return manifest;
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function onlyVisibleDirectText(
  childIds: string[],
  ir: DesignIRV2,
  role: string,
):
  | {
      nodeId: string;
      text: string;
      rule:
        | "single-visible-direct-text"
        | "unique-leading-typography-dominant-direct-text";
    }
  | undefined {
  const visible: { nodeId: string; text: string; y: number }[] = [];
  for (const childId of childIds) {
    const child = ir.nodes[childId];
    if (child?.visible && child.text?.value) {
      visible.push({
        nodeId: childId,
        text: child.text.value,
        y: child.geometry.y,
      });
    }
  }
  if (visible.length === 1) {
    return {
      nodeId: visible[0]!.nodeId,
      text: visible[0]!.text,
      rule: "single-visible-direct-text",
    };
  }
  if (role !== "heading" || visible.length === 0) {
    return undefined;
  }

  const leading = visible.filter(
    (candidate) => candidate.y === Math.min(...visible.map((entry) => entry.y)),
  );
  if (leading.length !== 1) {
    return undefined;
  }
  const candidate = leading[0]!;
  const candidateHeight = ir.nodes[candidate.nodeId]!.geometry.height;
  const otherHeights = visible
    .filter((entry) => entry.nodeId !== candidate.nodeId)
    .map((entry) => ir.nodes[entry.nodeId]!.geometry.height);
  if (
    otherHeights.length === 0 ||
    !otherHeights.every((height) => candidateHeight > height)
  ) {
    return undefined;
  }
  return {
    nodeId: candidate.nodeId,
    text: candidate.text,
    rule: "unique-leading-typography-dominant-direct-text",
  };
}
