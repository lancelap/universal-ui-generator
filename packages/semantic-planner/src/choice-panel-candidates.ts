import type {
  ChoicePanelContent,
  ChoicePanelOption,
  ChoicePanelSection,
  ChoicePanelState,
  DesignIRV2,
  DesignNodeV2,
  Diagnostic,
  NormalizationProvenanceV1,
  SemanticEvidence,
} from "@uig/contracts";

const geometryTolerance = 0.5;

export interface ChoicePanelCandidate {
  boundaryNodeId: string;
  confidence: number;
  content: ChoicePanelContent;
  state: ChoicePanelState;
  sourceNodeIds: string[];
  consumedNodeIds: string[];
  implementationNodeIds: string[];
  unconsumedMeaningfulNodeIds: string[];
  evidence: SemanticEvidence[];
  diagnostics: Diagnostic[];
}

export type ChoicePanelCandidateResult =
  | {
      status: "candidate";
      candidate: ChoicePanelCandidate;
    }
  | {
      status: "none";
      reasons: string[];
    };

interface RowCandidate {
  boundary: DesignNodeV2;
  marker: DesignNodeV2;
  label: DesignNodeV2;
  description?: DesignNodeV2;
  duplicateDescriptionIds: string[];
  sourceNodeIds: string[];
}

export function extractChoicePanelCandidate(input: {
  ir: DesignIRV2;
  provenance: NormalizationProvenanceV1;
  boundaryNodeId: string;
}): ChoicePanelCandidateResult {
  const boundary = input.ir.nodes[input.boundaryNodeId];
  if (!boundary?.visible) {
    return { status: "none", reasons: ["boundary is missing or hidden"] };
  }
  const directChildren = boundary.children.flatMap((id) => {
    const child = input.ir.nodes[id];
    return child?.visible ? [child] : [];
  });
  const rows = directChildren.flatMap((child) => {
    const candidate = rowCandidate(child, input.ir, input.provenance);
    return candidate ? [candidate] : [];
  });
  if (rows.length < 2) {
    return { status: "none", reasons: ["fewer than two option rows"] };
  }

  const trailingIndicators = repeatedTrailingIndicators(
    directChildren,
    input.ir,
  );
  const acceptedRows =
    trailingIndicators.length >= 2
      ? rows.filter(
          (row) =>
            right(row.boundary) <=
            trailingIndicators[0]!.geometry.x + geometryTolerance,
        )
      : rows;
  if (acceptedRows.length < 2) {
    return {
      status: "none",
      reasons: ["fewer than two rows fit the repeated marker columns"],
    };
  }
  if (
    trailingIndicators.length >= 2 &&
    acceptedRows.length !== trailingIndicators.length
  ) {
    return {
      status: "none",
      reasons: ["option and trailing-indicator cardinalities differ"],
    };
  }

  const selectedBoundaryIds = new Set(
    acceptedRows.map((row) => row.boundary.id),
  );
  const orderedRows = directChildren.flatMap((child) => {
    const row = acceptedRows.find(
      (candidate) => candidate.boundary.id === child.id,
    );
    return row ? [row] : [];
  });
  const titleResult = findTitle(directChildren, input.ir, boundary);
  if (!titleResult) {
    return { status: "none", reasons: ["unique header title is missing"] };
  }
  if (
    hasAmbiguousSectionLabel(directChildren, orderedRows, titleResult.title.id)
  ) {
    return {
      status: "none",
      reasons: ["more than one section label competes for one row boundary"],
    };
  }

  const inferredSection = inferSectionLayout({
    directChildren,
    rows: orderedRows,
    titleNodeId: titleResult.title.id,
    ir: input.ir,
  });
  const semanticRows = inferredSection
    ? [
        ...orderedRows.filter(
          (row) => !inferredSection.rowIds.has(row.boundary.id),
        ),
        ...orderedRows.filter((row) =>
          inferredSection.rowIds.has(row.boundary.id),
        ),
      ]
    : orderedRows;

  const sections = buildSections({
    directChildren,
    rows: semanticRows,
    titleNodeId: titleResult.title.id,
    indicators: trailingIndicators,
    ...(inferredSection
      ? {
          forcedSection: {
            label: inferredSection.label,
            nextRowId: semanticRows.find((row) =>
              inferredSection.rowIds.has(row.boundary.id),
            )!.boundary.id,
          },
        }
      : {}),
  });
  const duplicateDiagnostics = semanticRows.flatMap((row, optionIndex) =>
    row.duplicateDescriptionIds.length > 0
      ? [
          {
            severity: "info" as const,
            blocking: false,
            stage: "semantic-planning" as const,
            code: "DUPLICATE_MATERIALIZED_NODE_COLLAPSED",
            message:
              "Collapsed overlapping materialized nodes in one choice option description slot",
            source: {
              artifactId: input.ir.sourceArtifactId,
              nodeId: row.boundary.id,
            },
            evidence: {
              semanticSlot: `options[${optionIndex}].description`,
              retainedNodeId: row.description!.id,
              collapsedNodeIds: row.duplicateDescriptionIds,
            },
          },
        ]
      : [],
  );

  const semanticSourceIds = new Set<string>([
    boundary.id,
    titleResult.title.id,
    ...descendantClosure(titleResult.headerAsset?.id, input.ir),
  ]);
  for (const section of sections) {
    if (section.labelSourceNodeId) {
      semanticSourceIds.add(section.labelSourceNodeId);
    }
    for (const option of section.options) {
      option.sourceNodeIds.forEach((id) => semanticSourceIds.add(id));
      if (option.info) {
        descendantClosure(option.info.sourceNodeId, input.ir).forEach((id) =>
          semanticSourceIds.add(id),
        );
      }
    }
  }

  const alternativeImplementationNodeIds = rows
    .filter((row) => !selectedBoundaryIds.has(row.boundary.id))
    .filter((row) =>
      sharesDefinitionProvenance(row, semanticRows, input.provenance),
    )
    .flatMap((row) => descendantClosure(row.boundary.id, input.ir));
  const hiddenImplementationNodeIds = boundary.children
    .filter((id) => input.ir.nodes[id]?.visible === false)
    .flatMap((id) => descendantClosure(id, input.ir));
  const emptyImplementationNodeIds = directChildren
    .filter((child) => !semanticSourceIds.has(child.id))
    .filter((child) =>
      descendantClosure(child.id, input.ir).every((id) => {
        const node = input.ir.nodes[id]!;
        return (
          (node.type === "frame" || node.type === "unknown") &&
          !node.text &&
          !node.component &&
          !node.asset
        );
      }),
    )
    .flatMap((child) => descendantClosure(child.id, input.ir));
  const implementationNodeIds = [
    ...new Set([
      ...alternativeImplementationNodeIds,
      ...hiddenImplementationNodeIds,
      ...emptyImplementationNodeIds,
    ]),
  ];
  const consumedNodeIds = [
    ...new Set([...semanticSourceIds, ...implementationNodeIds]),
  ];
  const unconsumedMeaningfulNodeIds = descendantClosure(boundary.id, input.ir)
    .filter((id) => !consumedNodeIds.includes(id))
    .filter((id) => isMeaningful(input.ir.nodes[id]!));

  const content: ChoicePanelContent = {
    title: titleResult.title.text!.value,
    titleSourceNodeId: titleResult.title.id,
    ...(titleResult.headerAsset?.asset?.name
      ? {
          headerIcon: {
            hint: titleResult.headerAsset.asset.name,
            sourceNodeId: titleResult.headerAsset.id,
          },
        }
      : {}),
    sections,
  };
  const supporting = {
    trailing: trailingIndicators.length === semanticRows.length,
    descriptions: semanticRows.every((row) => Boolean(row.description)),
    section: sections.length > 1,
    outline:
      boundary.appearance.borders.length > 0 &&
      Object.values(boundary.appearance.radii).some((value) => value > 0),
    headerAsset: Boolean(titleResult.headerAsset),
  };
  const confidence =
    0.8 +
    (supporting.trailing ? 0.05 : 0) +
    (supporting.descriptions ? 0.05 : 0) +
    (supporting.section ? 0.04 : 0) +
    (supporting.outline ? 0.03 : 0) +
    (supporting.headerAsset ? 0.03 : 0);

  return {
    status: "candidate",
    candidate: {
      boundaryNodeId: boundary.id,
      confidence: Math.min(1, Math.round(confidence * 100) / 100),
      content,
      state: {
        selectionMode: "single",
        selectedOptionId: null,
      },
      sourceNodeIds: [...semanticSourceIds],
      consumedNodeIds,
      implementationNodeIds,
      unconsumedMeaningfulNodeIds,
      evidence: [
        {
          kind: "repeated-option-rows",
          value: String(semanticRows.length),
          weight: 0.2,
        },
        { kind: "unique-option-labels", value: "all", weight: 0.15 },
        {
          kind: "consistent-leading-marker-column",
          value: "present",
          weight: 0.15,
        },
        { kind: "common-panel-boundary", value: boundary.id, weight: 0.15 },
        {
          kind: "unique-header-title",
          value: titleResult.title.id,
          weight: 0.15,
        },
      ],
      diagnostics: duplicateDiagnostics,
    },
  };
}

function rowCandidate(
  boundary: DesignNodeV2,
  ir: DesignIRV2,
  provenance: NormalizationProvenanceV1,
): RowCandidate | undefined {
  const descendants = descendantClosure(boundary.id, ir)
    .slice(1)
    .flatMap((id) => (ir.nodes[id]?.visible ? [ir.nodes[id]!] : []));
  const markers = descendants.filter(
    (node) =>
      node.type === "ellipse" &&
      node.geometry.width <= 24 &&
      node.geometry.height <= 24,
  );
  if (markers.length !== 1) {
    return undefined;
  }
  const textNodes = descendants.filter(
    (node) => node.text?.value.trim() && node.geometry.height > 0,
  );
  const groups = collapseEquivalentText(textNodes, provenance);
  if (groups.length < 1 || groups.length > 2) {
    return undefined;
  }
  groups.sort(
    (left, right) =>
      left.retained.geometry.y - right.retained.geometry.y ||
      left.retained.geometry.x - right.retained.geometry.x ||
      left.retained.id.localeCompare(right.retained.id),
  );
  if (
    groups.length === 2 &&
    Math.abs(groups[0]!.retained.geometry.y - groups[1]!.retained.geometry.y) <=
      geometryTolerance
  ) {
    return undefined;
  }
  const label = groups[0]!.retained;
  const descriptionGroup = groups[1];
  return {
    boundary,
    marker: markers[0]!,
    label,
    ...(descriptionGroup ? { description: descriptionGroup.retained } : {}),
    duplicateDescriptionIds: descriptionGroup?.duplicates ?? [],
    sourceNodeIds: descendantClosure(boundary.id, ir),
  };
}

function collapseEquivalentText(
  nodes: DesignNodeV2[],
  provenance: NormalizationProvenanceV1,
): { retained: DesignNodeV2; duplicates: string[] }[] {
  const groups: { retained: DesignNodeV2; duplicates: string[] }[] = [];
  for (const node of [...nodes].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const match = groups.find(
      (group) =>
        normalizeText(group.retained.text!.value) ===
          normalizeText(node.text!.value) &&
        sameRectangle(group.retained, node) &&
        (provenanceRelates(group.retained.id, node.id, provenance) ||
          sameRectangle(group.retained, node)),
    );
    if (match) {
      match.duplicates.push(node.id);
    } else {
      groups.push({ retained: node, duplicates: [] });
    }
  }
  return groups;
}

function buildSections(input: {
  directChildren: DesignNodeV2[];
  rows: RowCandidate[];
  titleNodeId: string;
  indicators: DesignNodeV2[];
  forcedSection?: { label: DesignNodeV2; nextRowId: string };
}): ChoicePanelSection[] {
  const rowIndex = new Map(
    input.rows.map((row) => [
      row.boundary.id,
      input.directChildren.findIndex((child) => child.id === row.boundary.id),
    ]),
  );
  const sectionLabels = input.forcedSection
    ? []
    : input.directChildren.filter(
        (child) =>
          child.id !== input.titleNodeId &&
          Boolean(child.text?.value.trim()) &&
          input.rows.some((row, index) => {
            if (index === 0) {
              return false;
            }
            const previous = rowIndex.get(input.rows[index - 1]!.boundary.id)!;
            const current = rowIndex.get(row.boundary.id)!;
            const candidate = input.directChildren.findIndex(
              (entry) => entry.id === child.id,
            );
            return candidate > previous && candidate < current;
          }),
      );
  const labelByNextRow = new Map<string, DesignNodeV2>();
  if (input.forcedSection) {
    labelByNextRow.set(
      input.forcedSection.nextRowId,
      input.forcedSection.label,
    );
  }
  for (const label of sectionLabels) {
    const labelIndex = input.directChildren.findIndex(
      (child) => child.id === label.id,
    );
    const nextRow = input.rows.find(
      (row) => rowIndex.get(row.boundary.id)! > labelIndex,
    );
    if (nextRow) {
      labelByNextRow.set(nextRow.boundary.id, label);
    }
  }

  const sections: ChoicePanelSection[] = [];
  input.rows.forEach((row, optionIndex) => {
    const label = labelByNextRow.get(row.boundary.id);
    if (sections.length === 0 || label) {
      sections.push({
        id: stableId("section", row.boundary.id),
        ...(label
          ? { label: label.text!.value, labelSourceNodeId: label.id }
          : {}),
        options: [],
      });
    }
    const indicator = input.indicators[optionIndex];
    const option: ChoicePanelOption = {
      id: stableId("option", row.boundary.id),
      sourceNodeIds: [...new Set(row.sourceNodeIds)],
      label: row.label.text!.value,
      labelSourceNodeId: row.label.id,
      ...(row.description
        ? {
            description: row.description.text!.value,
            descriptionSourceNodeIds: [
              row.description.id,
              ...row.duplicateDescriptionIds,
            ],
          }
        : {}),
      ...(indicator
        ? {
            info: {
              present: true as const,
              hint: "information",
              sourceNodeId: indicator.id,
            },
          }
        : {}),
      selected: false,
    };
    sections.at(-1)!.options.push(option);
  });
  return sections;
}

function inferSectionLayout(input: {
  directChildren: DesignNodeV2[];
  rows: RowCandidate[];
  titleNodeId: string;
  ir: DesignIRV2;
}): { label: DesignNodeV2; rowIds: Set<string> } | undefined {
  const rowIndexes = input.rows.map((row) =>
    input.directChildren.findIndex((child) => child.id === row.boundary.id),
  );
  const labels = input.directChildren.filter((child) => {
    if (child.id === input.titleNodeId || !child.text?.value.trim()) {
      return false;
    }
    const index = input.directChildren.findIndex(
      (candidate) => candidate.id === child.id,
    );
    return rowIndexes.some(
      (rowIndex, rowOffset) =>
        rowOffset > 0 && index > rowIndexes[rowOffset - 1]! && index < rowIndex,
    );
  });
  if (labels.length !== 1) {
    return undefined;
  }
  const label = labels[0]!;
  const emptyFrames = input.directChildren.filter(
    (child) =>
      (child.type === "frame" || child.type === "unknown") &&
      descendantClosure(child.id, input.ir).every((id) => {
        const node = input.ir.nodes[id]!;
        return !node.text && !node.component && !node.asset;
      }),
  );
  const labelWrappers = emptyFrames.filter(
    (frame) =>
      frame.layout?.mode === "vertical" &&
      frame.geometry.y > label.geometry.y + geometryTolerance &&
      Math.abs(frame.geometry.width - label.geometry.width) <=
        geometryTolerance &&
      Math.abs(frame.geometry.height - label.geometry.height) <=
        geometryTolerance,
  );
  if (labelWrappers.length !== 1) {
    return undefined;
  }
  const labelWrapper = labelWrappers[0]!;
  const rowHeights = new Set(
    input.rows.map((row) => Math.round(row.boundary.geometry.height)),
  );
  const slots = emptyFrames
    .filter(
      (frame) =>
        frame.layout?.mode === "horizontal" &&
        frame.geometry.y >
          labelWrapper.geometry.y + labelWrapper.geometry.height &&
        Math.abs(frame.geometry.width - label.geometry.width) <=
          geometryTolerance &&
        rowHeights.has(Math.round(frame.geometry.height)),
    )
    .sort(
      (left, right) =>
        left.geometry.y - right.geometry.y || left.id.localeCompare(right.id),
    );
  const chains = slots.flatMap((first) => {
    const gap =
      first.geometry.y -
      (labelWrapper.geometry.y + labelWrapper.geometry.height);
    if (gap <= geometryTolerance) {
      return [];
    }
    const chain = [first];
    let expectedY = first.geometry.y + first.geometry.height + gap;
    while (true) {
      const next = slots.find(
        (slot) =>
          !chain.includes(slot) &&
          Math.abs(slot.geometry.y - expectedY) <= geometryTolerance,
      );
      if (!next) {
        break;
      }
      chain.push(next);
      expectedY = next.geometry.y + next.geometry.height + gap;
    }
    return chain.length >= 2 ? [chain] : [];
  });
  const longest = Math.max(0, ...chains.map((chain) => chain.length));
  const best = chains.filter((chain) => chain.length === longest);
  if (longest < 2 || best.length !== 1) {
    return undefined;
  }
  const labelIndex = input.directChildren.findIndex(
    (child) => child.id === label.id,
  );
  const candidates = input.rows.filter(
    (row) =>
      input.directChildren.findIndex((child) => child.id === row.boundary.id) >
      labelIndex,
  );
  const selected: RowCandidate[] = [];
  for (const slot of best[0]!) {
    const row = candidates.find(
      (candidate) =>
        !selected.includes(candidate) &&
        Math.abs(candidate.boundary.geometry.height - slot.geometry.height) <=
          geometryTolerance,
    );
    if (!row) {
      return undefined;
    }
    selected.push(row);
  }
  if (selected.length >= input.rows.length) {
    return undefined;
  }
  return {
    label,
    rowIds: new Set(selected.map((row) => row.boundary.id)),
  };
}

function hasAmbiguousSectionLabel(
  directChildren: DesignNodeV2[],
  rows: RowCandidate[],
  titleNodeId: string,
): boolean {
  const indexes = rows.map((row) =>
    directChildren.findIndex((child) => child.id === row.boundary.id),
  );
  return indexes.slice(1).some((current, index) => {
    const previous = indexes[index]!;
    return (
      directChildren
        .slice(previous + 1, current)
        .filter(
          (child) =>
            child.id !== titleNodeId && Boolean(child.text?.value.trim()),
        ).length > 1
    );
  });
}

function findTitle(
  directChildren: DesignNodeV2[],
  ir: DesignIRV2,
  boundary: DesignNodeV2,
): { title: DesignNodeV2; headerAsset?: DesignNodeV2 } | undefined {
  const left = boundary.geometry.x + (boundary.layout?.padding.left ?? 0) + 4;
  const titleCandidates = directChildren.filter(
    (child) => Boolean(child.text?.value.trim()) && child.geometry.x > left,
  );
  const pairs = titleCandidates.flatMap((title) => {
    const assets = directChildren.filter(
      (candidate) =>
        !candidate.text &&
        candidate.geometry.width <= 32 &&
        candidate.geometry.height <= 32 &&
        right(candidate) <= title.geometry.x + geometryTolerance &&
        overlapsVertically(candidate, title),
    );
    return assets.length === 1 ? [{ title, headerAsset: assets[0]! }] : [];
  });
  if (pairs.length === 1) {
    return pairs[0];
  }
  if (titleCandidates.length === 1) {
    return { title: titleCandidates[0]! };
  }
  return undefined;
}

function repeatedTrailingIndicators(
  children: DesignNodeV2[],
  ir: DesignIRV2,
): DesignNodeV2[] {
  const candidates = children.filter(
    (child) =>
      !child.text &&
      child.geometry.width <= 32 &&
      child.geometry.height <= 32 &&
      !descendantClosure(child.id, ir).some((id) => ir.nodes[id]?.text),
  );
  const groups = new Map<number, DesignNodeV2[]>();
  for (const candidate of candidates) {
    const key = Math.round(candidate.geometry.x);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return (
    [...groups.values()]
      .filter((group) => group.length >= 2)
      .sort(
        (left, right) =>
          right.length - left.length ||
          right[0]!.geometry.x - left[0]!.geometry.x,
      )[0] ?? []
  );
}

function sharesDefinitionProvenance(
  candidate: RowCandidate,
  accepted: RowCandidate[],
  provenance: NormalizationProvenanceV1,
): boolean {
  const candidateDefinitions = definitionIds(candidate.boundary.id, provenance);
  return accepted.some((row) =>
    [...definitionIds(row.boundary.id, provenance)].some((id) =>
      candidateDefinitions.has(id),
    ),
  );
}

function definitionIds(
  nodeId: string,
  provenance: NormalizationProvenanceV1,
): Set<string> {
  return new Set(
    provenance.values.flatMap((origin) =>
      origin.targetNodeId === nodeId && origin.componentDefinitionNodeId
        ? [origin.componentDefinitionNodeId]
        : [],
    ),
  );
}

function provenanceRelates(
  leftId: string,
  rightId: string,
  provenance: NormalizationProvenanceV1,
): boolean {
  const left = definitionIds(leftId, provenance);
  return [...definitionIds(rightId, provenance)].some((id) => left.has(id));
}

function descendantClosure(
  rootId: string | undefined,
  ir: DesignIRV2,
): string[] {
  if (!rootId) {
    return [];
  }
  const result: string[] = [];
  const visit = (id: string): void => {
    const node = ir.nodes[id];
    if (!node || result.includes(id)) {
      return;
    }
    result.push(id);
    node.children.forEach(visit);
  };
  visit(rootId);
  return result;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isMeaningful(node: DesignNodeV2): boolean {
  return Boolean(
    node.visible &&
    (node.text?.value.trim() ||
      node.component ||
      node.asset ||
      node.type === "ellipse" ||
      node.type === "symbol" ||
      node.type === "instance"),
  );
}

function sameRectangle(left: DesignNodeV2, rightNode: DesignNodeV2): boolean {
  return (
    Math.abs(left.geometry.x - rightNode.geometry.x) <= geometryTolerance &&
    Math.abs(left.geometry.y - rightNode.geometry.y) <= geometryTolerance &&
    Math.abs(left.geometry.width - rightNode.geometry.width) <=
      geometryTolerance &&
    Math.abs(left.geometry.height - rightNode.geometry.height) <=
      geometryTolerance
  );
}

function overlapsVertically(
  left: DesignNodeV2,
  rightNode: DesignNodeV2,
): boolean {
  return (
    left.geometry.y < rightNode.geometry.y + rightNode.geometry.height &&
    rightNode.geometry.y < left.geometry.y + left.geometry.height
  );
}

function right(node: DesignNodeV2): number {
  return node.geometry.x + node.geometry.width;
}

function stableId(prefix: string, sourceNodeId: string): string {
  return `${prefix}-${sourceNodeId
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}
