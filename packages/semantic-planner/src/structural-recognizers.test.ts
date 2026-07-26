import type { Appearance, DesignIR, DesignNode } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import {
  confidencePolicy,
  recognizeStructure,
} from "./structural-recognizers.js";

const plain: Appearance = {
  fills: [],
  borders: [],
  radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  shadows: [],
  opacity: 1,
};

function node(id: string, options: Partial<DesignNode> = {}): DesignNode {
  return {
    id,
    type: "frame",
    name: id,
    visible: true,
    children: [],
    geometry: { x: 0, y: 0, width: 300, height: 40 },
    appearance: plain,
    source: { provider: "pixso", nodeId: id },
    ...options,
  };
}

function ir(nodes: DesignNode[], rootNodeId = nodes[0]!.id): DesignIR {
  return {
    schema: "design-ir/v1",
    sourceArtifactId: "artifact",
    dslVersion: "2.1.15",
    rootNodeId,
    nodes: Object.fromEntries(nodes.map((item) => [item.id, item])),
    diagnostics: [],
  };
}

describe("structural recognizers", () => {
  it.each([
    [
      "heading",
      [
        node("heading", {
          type: "text",
          name: "Dialog title",
          text: { value: "Создать заявку", fontSize: 24, fontWeight: 600 },
        }),
      ],
      "heading",
    ],
    [
      "text input",
      [
        node("field", {
          name: "Text input",
          children: ["label", "value"],
          appearance: {
            ...plain,
            borders: [
              {
                position: "inside",
                width: { top: 1, right: 1, bottom: 1, left: 1 },
                style: "solid",
                color: "#808080",
                opacity: 1,
              },
            ],
          },
        }),
        node("label", { type: "text", text: { value: "Название" } }),
        node("value", { type: "text", text: { value: "Значение" } }),
      ],
      "textInput",
    ],
    [
      "combobox",
      [
        node("combo", {
          name: "Select dropdown field",
          children: ["value", "chevron"],
        }),
        node("value", { type: "text", text: { value: "Вариант" } }),
        node("chevron", { name: "Dropdown indicator" }),
      ],
      "combobox",
    ],
    [
      "warning",
      [
        node("warning", {
          name: "Warning alert",
          children: ["warning-text"],
          appearance: {
            ...plain,
            fills: [{ type: "solid", color: "#FFF3CD", opacity: 1 }],
          },
        }),
        node("warning-text", {
          type: "text",
          text: { value: "Внимание" },
        }),
      ],
      "warning",
    ],
    [
      "action group",
      [
        node("actions", {
          name: "Dialog actions",
          children: ["cancel", "submit"],
          layout: {
            mode: "horizontal",
            gap: 8,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            alignItems: "center",
          },
        }),
        node("cancel", { name: "Cancel button" }),
        node("submit", { name: "Submit button" }),
      ],
      "actionGroup",
    ],
    [
      "vertical group",
      [
        node("stack", {
          layout: {
            mode: "vertical",
            gap: 8,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            alignItems: "start",
          },
        }),
      ],
      "verticalGroup",
    ],
  ])("recognizes %s with evidence", (_label, nodes, role) => {
    const design = ir(nodes as DesignNode[]);
    const result = recognizeStructure(design.nodes[design.rootNodeId]!, design);

    expect(result).toMatchObject({
      role,
      confidence: expect.any(Number),
      evidence: expect.arrayContaining([
        expect.objectContaining({ weight: expect.any(Number) }),
      ]),
    });
    expect(result!.confidence).toBeGreaterThanOrEqual(confidencePolicy.warning);
  });

  it("recognizes a dialog from top-level structure", () => {
    const design = ir([
      node("dialog", {
        name: "Create modal",
        children: ["title", "body", "actions"],
        appearance: {
          ...plain,
          shadows: [
            {
              type: "drop",
              x: 0,
              y: 8,
              blur: 24,
              spread: 0,
              color: "#000000",
              opacity: 0.2,
            },
          ],
        },
      }),
      node("title", {
        type: "text",
        name: "Title",
        text: { value: "Создать", fontSize: 24 },
      }),
      node("body", { name: "Body" }),
      node("actions", {
        name: "Actions",
        layout: {
          mode: "horizontal",
          gap: 8,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          alignItems: "center",
        },
      }),
    ]);

    expect(recognizeStructure(design.nodes.dialog!, design)).toMatchObject({
      kind: "overlay",
      role: "dialog",
      confidence: expect.any(Number),
    });
  });

  it("leaves a decorative frame below the warning threshold", () => {
    const design = ir([node("decoration", { name: "Rectangle 12" })]);
    const result = recognizeStructure(design.nodes.decoration!, design);

    expect(result?.confidence ?? 0).toBeLessThan(confidencePolicy.warning);
  });
});
