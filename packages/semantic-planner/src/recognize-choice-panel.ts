import type {
  DesignIRV2,
  Diagnostic,
  NormalizationProvenanceV1,
  UiNodeV2,
} from "@uig/contracts";

import { extractChoicePanelCandidate } from "./choice-panel-candidates.js";

export type ChoicePanelRecognitionResult =
  | {
      status: "recognized";
      node: UiNodeV2;
      consumedSourceNodeIds: string[];
      diagnostics: Diagnostic[];
    }
  | { status: "not-recognized"; diagnostics: Diagnostic[] }
  | { status: "blocked"; diagnostic: Diagnostic };

export function recognizeChoicePanel(input: {
  ir: DesignIRV2;
  provenance: NormalizationProvenanceV1;
  boundaryNodeId: string;
}): ChoicePanelRecognitionResult {
  const extracted = extractChoicePanelCandidate(input);
  if (extracted.status === "none") {
    return { status: "not-recognized", diagnostics: [] };
  }
  const candidate = extracted.candidate;
  if (candidate.unconsumedMeaningfulNodeIds.length > 0) {
    return {
      status: "blocked",
      diagnostic: {
        severity: "error",
        blocking: true,
        stage: "semantic-planning",
        code: "CHOICE_PANEL_STRUCTURE_INCOMPLETE",
        message:
          "Choice panel recognition would hide meaningful unconsumed descendants",
        source: {
          artifactId: input.ir.sourceArtifactId,
          nodeId: candidate.boundaryNodeId,
        },
        evidence: {
          unconsumedMeaningfulNodeIds: candidate.unconsumedMeaningfulNodeIds,
        },
      },
    };
  }

  return {
    status: "recognized",
    node: {
      id: `ui_choicePanel_${sanitize(candidate.boundaryNodeId)}`,
      kind: "control",
      role: "choicePanel",
      sourceNodeIds: candidate.consumedNodeIds,
      layoutSourceNodeId: candidate.boundaryNodeId,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      content: candidate.content,
      state: candidate.state,
      children: [],
    },
    consumedSourceNodeIds: candidate.consumedNodeIds,
    diagnostics: candidate.diagnostics,
  };
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}
