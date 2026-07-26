import type { DesignIR, DesignNode } from "@uig/contracts";

import {
  recognition,
  type SemanticRecognition,
  type WeightedEvidence,
} from "./evidence.js";

export const confidencePolicy = {
  automatic: 0.85,
  warning: 0.6,
} as const;

export function recognizeStructure(
  node: DesignNode,
  ir: DesignIR,
): SemanticRecognition | undefined {
  const children = node.children.flatMap((id) => {
    const child = ir.nodes[id];
    return child ? [child] : [];
  });
  const candidates = [
    dialog(node, children),
    actionGroup(node, children),
    combobox(node, children),
    textInput(node, children),
    warning(node, children),
    heading(node),
    action(node),
    layoutGroup(node),
    decorative(node),
  ].filter((candidate): candidate is SemanticRecognition => Boolean(candidate));

  return candidates.sort(
    (left, right) => right.confidence - left.confidence,
  )[0];
}

function dialog(
  node: DesignNode,
  children: DesignNode[],
): SemanticRecognition | undefined {
  const evidence: WeightedEvidence[] = [];
  add(evidence, node.type === "frame", "node-type", "frame", 0.15);
  add(evidence, /modal|dialog/i.test(node.name), "layer-name", node.name, 0.3);
  const headingChild = children.find(isHeadingLike);
  if (headingChild) {
    evidence.push({
      kind: "heading-child",
      value: headingChild.id,
      weight: 0.2,
      sourceNodeId: headingChild.id,
    });
  }
  const actionChild = children.find(isActionLike);
  if (actionChild) {
    evidence.push({
      kind: "action-child",
      value: actionChild.id,
      weight: 0.15,
      sourceNodeId: actionChild.id,
    });
  }
  add(
    evidence,
    node.appearance.shadows.length > 0,
    "drop-shadow",
    "present",
    0.1,
  );
  return candidate(node, "overlay", "dialog", evidence);
}

function heading(node: DesignNode): SemanticRecognition | undefined {
  const evidence: WeightedEvidence[] = [];
  add(
    evidence,
    Boolean(node.text?.value),
    "non-empty-text",
    node.text?.value ?? "",
    0.3,
  );
  add(
    evidence,
    /heading|title|заголов/i.test(node.name),
    "layer-name",
    node.name,
    0.4,
  );
  add(
    evidence,
    (node.text?.fontSize ?? 0) >= 20 || (node.text?.fontWeight ?? 0) >= 600,
    "heading-typography",
    `${node.text?.fontSize ?? ""}/${node.text?.fontWeight ?? ""}`,
    0.3,
  );
  return candidate(node, "content", "heading", evidence);
}

function textInput(
  node: DesignNode,
  children: DesignNode[],
): SemanticRecognition | undefined {
  const evidence: WeightedEvidence[] = [];
  add(evidence, /field|input/i.test(node.name), "layer-name", node.name, 0.35);
  add(
    evidence,
    node.appearance.borders.length > 0,
    "field-border",
    "present",
    0.2,
  );
  add(
    evidence,
    children.filter((child) => child.text?.value).length >= 2,
    "label-value-text",
    "two text children",
    0.35,
  );
  add(evidence, node.type === "frame", "node-type", "frame", 0.1);
  return candidate(node, "control", "textInput", evidence);
}

function combobox(
  node: DesignNode,
  children: DesignNode[],
): SemanticRecognition | undefined {
  const indicator = children.find((child) =>
    /dropdown|chevron|arrow/i.test(child.name),
  );
  const evidence: WeightedEvidence[] = [];
  add(
    evidence,
    /combo|select|dropdown/i.test(node.name) || Boolean(indicator),
    "dropdown-evidence",
    indicator?.id ?? node.name,
    0.5,
  );
  add(
    evidence,
    children.some((child) => Boolean(child.text?.value)),
    "value-text",
    "present",
    0.2,
  );
  add(evidence, node.type === "frame", "node-type", "frame", 0.15);
  return candidate(node, "control", "combobox", evidence);
}

function warning(
  node: DesignNode,
  children: DesignNode[],
): SemanticRecognition | undefined {
  const evidence: WeightedEvidence[] = [];
  add(
    evidence,
    node.appearance.fills.length > 0,
    "highlighted-fill",
    "present",
    0.25,
  );
  add(
    evidence,
    /warning|alert|вниман|предупреж/i.test(
      `${node.name} ${children.map((child) => child.text?.value ?? child.name).join(" ")}`,
    ),
    "warning-content",
    node.name,
    0.55,
  );
  add(evidence, node.type === "frame", "node-type", "frame", 0.1);
  return candidate(node, "content", "warning", evidence);
}

function actionGroup(
  node: DesignNode,
  children: DesignNode[],
): SemanticRecognition | undefined {
  const evidence: WeightedEvidence[] = [];
  add(
    evidence,
    node.layout?.mode === "horizontal",
    "horizontal-layout",
    "horizontal",
    0.4,
  );
  add(
    evidence,
    children.filter(isActionLike).length >= 2,
    "action-children",
    "two or more",
    0.4,
  );
  add(evidence, /action|button/i.test(node.name), "layer-name", node.name, 0.2);
  return candidate(node, "group", "actionGroup", evidence);
}

function action(node: DesignNode): SemanticRecognition | undefined {
  const evidence: WeightedEvidence[] = [];
  add(evidence, isActionLike(node), "action-shape", node.name, 0.65);
  add(
    evidence,
    node.geometry.width > node.geometry.height,
    "action-geometry",
    `${node.geometry.width}x${node.geometry.height}`,
    0.2,
  );
  add(
    evidence,
    Boolean(node.text?.value),
    "action-label",
    node.text?.value ?? "",
    0.15,
  );
  const role = /primary|submit|approve|confirm/i.test(node.name)
    ? "primaryAction"
    : /cancel|secondary|back/i.test(node.name)
      ? "secondaryAction"
      : "action";
  return candidate(node, "action", role, evidence);
}

function layoutGroup(node: DesignNode): SemanticRecognition | undefined {
  if (node.layout?.mode !== "vertical" && node.layout?.mode !== "horizontal") {
    return undefined;
  }
  return recognition({
    kind: "group",
    role: node.layout.mode === "vertical" ? "verticalGroup" : "horizontalGroup",
    fallbackSourceNodeId: node.id,
    evidence: [
      {
        kind: "auto-layout",
        value: node.layout.mode,
        weight: 0.9,
      },
    ],
  });
}

function decorative(node: DesignNode): SemanticRecognition | undefined {
  return node.type === "frame"
    ? recognition({
        kind: "unresolved",
        role: "unresolved",
        fallbackSourceNodeId: node.id,
        evidence: [{ kind: "node-type", value: "frame", weight: 0.15 }],
      })
    : undefined;
}

function candidate(
  node: DesignNode,
  kind: SemanticRecognition["kind"],
  role: string,
  evidence: WeightedEvidence[],
): SemanticRecognition | undefined {
  return evidence.length > 0
    ? recognition({
        kind,
        role,
        evidence,
        fallbackSourceNodeId: node.id,
      })
    : undefined;
}

function add(
  evidence: WeightedEvidence[],
  matched: boolean,
  kind: string,
  value: string,
  weight: number,
): void {
  if (matched) {
    evidence.push({ kind, value, weight });
  }
}

function isHeadingLike(node: DesignNode): boolean {
  return (
    Boolean(node.text?.value) &&
    (/heading|title/i.test(node.name) || (node.text?.fontSize ?? 0) >= 20)
  );
}

function isActionLike(node: DesignNode): boolean {
  return (
    /button|action|submit|cancel|approve|confirm/i.test(node.name) ||
    /button/i.test(node.component?.key ?? "")
  );
}
