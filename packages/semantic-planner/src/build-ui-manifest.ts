import {
  type DesignIR,
  type PixsoSemanticMapping,
  type UiManifest,
  type UiNode,
  UiManifestSchema,
  validateWithSchema,
} from "@uig/contracts";

import { createExactComponentRecognizer } from "./exact-component-recognizer.js";
import {
  confidencePolicy,
  recognizeStructure,
} from "./structural-recognizers.js";

export function buildUiManifest(input: {
  ir: DesignIR;
  exactMappings: PixsoSemanticMapping[];
}): UiManifest {
  const exact = createExactComponentRecognizer(input.exactMappings);
  const diagnostics: UiManifest["diagnostics"] = [];
  const ids = new Map<string, number>();

  const build = (nodeId: string): UiNode => {
    const node = input.ir.nodes[nodeId];
    if (!node) {
      throw new Error(`Design node does not exist: ${nodeId}`);
    }
    const exactRecognition = exact.match(node)?.recognition;
    const recognized = exactRecognition ?? recognizeStructure(node, input.ir);
    const accepted =
      recognized && recognized.confidence >= confidencePolicy.warning;
    const role = accepted ? recognized.role : "unresolved";
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
      sourceNodeIds: accepted ? recognized.sourceNodeIds : [node.id],
      confidence: accepted
        ? recognized.confidence
        : (recognized?.confidence ?? 0),
      evidence: recognized?.evidence ?? [],
      ...(node.text?.value
        ? { content: { text: node.text.value, label: node.text.value } }
        : {}),
      children: exactRecognition
        ? []
        : node.children.flatMap((childId) =>
            input.ir.nodes[childId] ? [build(childId)] : [],
          ),
    };
  };

  return validateWithSchema(UiManifestSchema, {
    schema: "ui-manifest/v1",
    sourceArtifactId: input.ir.sourceArtifactId,
    root: build(input.ir.rootNodeId),
    diagnostics,
  });
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}
