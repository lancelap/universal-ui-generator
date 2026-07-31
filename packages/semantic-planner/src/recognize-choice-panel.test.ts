import { readFileSync } from "node:fs";

import type { DesignNodeV2 } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { normalizePixsoDesignV2WithProvenance } from "../../design-normalizer/src/normalize-design.js";
import { recognizeChoicePanel } from "./recognize-choice-panel.js";

const rawDsl = JSON.parse(
  readFileSync(
    new URL(
      "../../../fixtures/pixso/node-70-118899/source.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as unknown;

function normalizedFixture() {
  return normalizePixsoDesignV2WithProvenance({
    artifactId: "choice-panel-fixture",
    rootNodeId: "70:118899",
    rawDsl,
  });
}

describe("recognizeChoicePanel", () => {
  it("recognizes the complete real panel as one compound control", () => {
    const normalized = normalizedFixture();

    const result = recognizeChoicePanel({
      ir: normalized.designIr,
      provenance: normalized.provenance,
      boundaryNodeId: normalized.designIr.rootNodeId,
    });

    expect(result.status).toBe("recognized");
    if (result.status !== "recognized") {
      return;
    }
    expect(result.node).toMatchObject({
      kind: "control",
      role: "choicePanel",
      layoutSourceNodeId: "70:118899",
      content: {
        title: "Выберите необходимые действия",
        headerIcon: { hint: "files" },
        sections: [
          {
            options: [
              { label: "Приостановить обработку сделки с данным контрагентом" },
              { label: "Изменений не требуется, продолжить обработку сделки" },
              { label: "Переформормировать запрос в ППРБ.PreTradeChecker" },
            ],
          },
          {
            label: "Сделка требует корректировок:",
            options: [
              { label: "Изменение платежных инструкций" },
              { label: "Требуется корректировка статики" },
            ],
          },
        ],
      },
      state: { selectionMode: "single", selectedOptionId: null },
      children: [],
    });
    expect(result.consumedSourceNodeIds).toHaveLength(83);
    expect(result.node.sourceNodeIds).toEqual(result.consumedSourceNodeIds);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "DUPLICATE_MATERIALIZED_NODE_COLLAPSED",
        blocking: false,
      }),
    ]);
  });

  it("blocks instead of hiding unrelated meaningful content", () => {
    const normalized = normalizedFixture();
    normalized.designIr.nodes.unrelated = textNode(
      "unrelated",
      "Unrelated content",
    );
    normalized.designIr.nodes[normalized.designIr.rootNodeId]!.children.push(
      "unrelated",
    );

    const result = recognizeChoicePanel({
      ir: normalized.designIr,
      provenance: normalized.provenance,
      boundaryNodeId: normalized.designIr.rootNodeId,
    });

    expect(result).toMatchObject({
      status: "blocked",
      diagnostic: {
        code: "CHOICE_PANEL_STRUCTURE_INCOMPLETE",
        blocking: true,
        evidence: {
          unconsumedMeaningfulNodeIds: ["unrelated"],
        },
      },
    });
  });

  it("returns not-recognized for an ordinary container", () => {
    const normalized = normalizedFixture();
    const root = normalized.designIr.nodes[normalized.designIr.rootNodeId]!;
    normalized.designIr.nodes = {
      [root.id]: { ...root, children: [] },
    };

    expect(
      recognizeChoicePanel({
        ir: normalized.designIr,
        provenance: normalized.provenance,
        boundaryNodeId: normalized.designIr.rootNodeId,
      }),
    ).toEqual({ status: "not-recognized", diagnostics: [] });
  });
});

function textNode(id: string, value: string): DesignNodeV2 {
  return {
    id,
    type: "text",
    name: "",
    visible: true,
    children: [],
    geometry: { x: 20, y: 360, width: 400, height: 18 },
    appearance: {
      fills: [],
      borders: [],
      radii: {
        topLeft: 0,
        topRight: 0,
        bottomRight: 0,
        bottomLeft: 0,
      },
      shadows: [],
      opacity: 1,
    },
    text: { value },
    source: { provider: "pixso", nodeId: id },
  };
}
