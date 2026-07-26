import type { SemanticEvidence, UiNodeKind } from "@uig/contracts";

export interface SemanticRecognition {
  kind: UiNodeKind;
  role: string;
  confidence: number;
  evidence: SemanticEvidence[];
  sourceNodeIds: string[];
}

export interface WeightedEvidence {
  kind: string;
  value: string;
  weight: number;
  sourceNodeId?: string;
}

export function recognition(input: {
  kind: UiNodeKind;
  role: string;
  evidence: WeightedEvidence[];
  fallbackSourceNodeId: string;
}): SemanticRecognition {
  const confidence = round4(
    Math.min(
      1,
      input.evidence.reduce((total, item) => total + item.weight, 0),
    ),
  );
  const sourceNodeIds = Array.from(
    new Set([
      input.fallbackSourceNodeId,
      ...input.evidence.flatMap((item) =>
        item.sourceNodeId ? [item.sourceNodeId] : [],
      ),
    ]),
  );

  return {
    kind: input.kind,
    role: input.role,
    confidence,
    evidence: input.evidence.map(({ kind, value, weight }) => ({
      kind,
      value,
      weight,
    })),
    sourceNodeIds,
  };
}

export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
