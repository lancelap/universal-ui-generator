import type {
  DesignIRV2,
  DesignNodeV2,
  Diagnostic,
  PixsoSemanticMapping,
} from "@uig/contracts";

export interface ProjectedSemanticChild {
  kind: "action";
  role: string;
  boundaryNodeId: string;
  labelNodeId: string;
  label: string;
}

export interface CompoundProjectionResult {
  children: ProjectedSemanticChild[];
  diagnostics: Diagnostic[];
}

export function projectCompoundBoundary(_input: {
  boundary: DesignNodeV2;
  mapping: PixsoSemanticMapping;
  ir: DesignIRV2;
}): CompoundProjectionResult {
  if (
    !("projection" in _input.mapping) ||
    _input.mapping.projection === undefined
  ) {
    return { children: [], diagnostics: [] };
  }

  const rejectedCandidates: RejectedCandidate[] = [];
  const candidates = discoverCandidates(
    _input.boundary,
    _input.ir,
    rejectedCandidates,
  );
  const overlapping = overlappingCandidateIds(candidates);
  const accepted = candidates
    .filter((candidate) => !overlapping.has(candidate.boundaryNodeId))
    .sort(compareCandidates);
  for (const nodeId of [...overlapping].sort()) {
    rejectedCandidates.push({ nodeId, reason: "overlap" });
  }

  const roles = _input.mapping.projection.roles;
  const children = accepted.slice(0, roles.length).map((candidate, index) => ({
    kind: "action" as const,
    role: roles[index]!,
    boundaryNodeId: candidate.boundaryNodeId,
    labelNodeId: candidate.labelNodeId,
    label: candidate.label,
  }));
  if (accepted.length === roles.length) {
    return { children, diagnostics: [] };
  }

  return {
    children,
    diagnostics: [
      {
        severity: "error",
        blocking: true,
        stage: "semantic-planning",
        code: "SEMANTIC_COMPOUND_PROJECTION_INCOMPLETE",
        message: `Compound action group expected ${roles.length} actions but found ${accepted.length}`,
        source: {
          artifactId: _input.ir.sourceArtifactId,
          nodeId: _input.boundary.id,
        },
        evidence: {
          expectedRoles: roles,
          acceptedCandidateNodeIds: accepted.map(
            (candidate) => candidate.boundaryNodeId,
          ),
          rejectedCandidates: rejectedCandidates.sort((left, right) =>
            left.nodeId.localeCompare(right.nodeId),
          ),
        },
      },
    ],
  };
}

interface ProjectedCandidate {
  parentNodeId: string;
  boundaryNodeId: string;
  labelNodeId: string;
  label: string;
  geometry: DesignNodeV2["geometry"];
}

interface RejectedCandidate {
  nodeId: string;
  reason: "ambiguous-label" | "overlap";
}

function discoverCandidates(
  boundary: DesignNodeV2,
  ir: DesignIRV2,
  rejected: RejectedCandidate[],
): ProjectedCandidate[] {
  const candidates: ProjectedCandidate[] = [];

  const visit = (nodeId: string, parentNodeId: string): void => {
    const node = ir.nodes[nodeId];
    if (!node?.visible) {
      return;
    }
    const directLabels = node.children.flatMap((childId) => {
      const child = ir.nodes[childId];
      return child?.visible && child.text?.value.trim()
        ? [{ nodeId: child.id, label: child.text.value }]
        : [];
    });
    const buttonLike =
      node.geometry.height > 0 &&
      node.geometry.width >= node.geometry.height * 1.5;
    if (buttonLike && directLabels.length === 1) {
      candidates.push({
        parentNodeId,
        boundaryNodeId: node.id,
        labelNodeId: directLabels[0]!.nodeId,
        label: directLabels[0]!.label,
        geometry: node.geometry,
      });
      return;
    }
    if (buttonLike && directLabels.length > 1) {
      rejected.push({ nodeId: node.id, reason: "ambiguous-label" });
    }
    for (const childId of node.children) {
      visit(childId, node.id);
    }
  };

  for (const childId of boundary.children) {
    visit(childId, boundary.id);
  }
  return candidates;
}

function overlappingCandidateIds(
  candidates: ProjectedCandidate[],
): Set<string> {
  const overlapping = new Set<string>();
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex]!;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidates.length;
      rightIndex += 1
    ) {
      const right = candidates[rightIndex]!;
      if (
        left.parentNodeId === right.parentNodeId &&
        rectanglesOverlap(left.geometry, right.geometry)
      ) {
        overlapping.add(left.boundaryNodeId);
        overlapping.add(right.boundaryNodeId);
      }
    }
  }
  return overlapping;
}

function rectanglesOverlap(
  left: DesignNodeV2["geometry"],
  right: DesignNodeV2["geometry"],
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function compareCandidates(
  left: ProjectedCandidate,
  right: ProjectedCandidate,
): number {
  return (
    left.geometry.y - right.geometry.y ||
    left.geometry.x - right.geometry.x ||
    left.boundaryNodeId.localeCompare(right.boundaryNodeId)
  );
}
