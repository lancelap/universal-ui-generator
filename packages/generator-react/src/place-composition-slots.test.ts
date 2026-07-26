import type { ReactCompositionRecipe, UiNodeV2 } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { ReactGenerationError } from "./errors.js";
import { placeCompositionSlots } from "./place-composition-slots.js";

describe("placeCompositionSlots", () => {
  it("routes explicit roles and preserves remaining child order exactly once", () => {
    const children = [
      child("heading", "heading"),
      child("description", "content"),
      child("field", "textInput"),
      child("actions", "actionGroup"),
    ];

    const placed = placeCompositionSlots({
      children,
      recipe: modalRecipe(),
    });

    expect(
      placed.slots.map((slot) => ({
        name: slot.name,
        childIds: slot.children.map((item) => item.id),
      })),
    ).toEqual([
      { name: "heading", childIds: ["heading"] },
      { name: "body", childIds: ["description", "field"] },
      { name: "actions", childIds: ["actions"] },
    ]);
    expect(
      placed.slots.flatMap((slot) => slot.children.map((item) => item.id)),
    ).toEqual(["heading", "description", "field", "actions"]);
  });

  it("rejects two children in a zero-or-one slot", () => {
    expect(() =>
      placeCompositionSlots({
        children: [
          child("heading-1", "heading"),
          child("heading-2", "heading"),
        ],
        recipe: modalRecipe(),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_COMPOSITION_AMBIGUOUS",
      }),
    );
  });

  it("rejects a missing child in an exactly-one slot", () => {
    const recipe = modalRecipe();
    recipe.slots[0]!.cardinality = "exactly-one";

    expect(() =>
      placeCompositionSlots({
        children: [child("description", "content")],
        recipe,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_COMPOSITION_AMBIGUOUS",
      }),
    );
  });

  it("rejects multiple remaining slots", () => {
    const recipe = modalRecipe();
    recipe.slots.push({
      name: "overflow",
      componentId: "mui.DialogContent",
      acceptsRemaining: true,
      cardinality: "many",
    });

    expect(() =>
      placeCompositionSlots({
        children: [child("description", "content")],
        recipe,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_COMPOSITION_AMBIGUOUS",
      }),
    );
  });

  it("rejects an unmatched child when no remaining slot exists", () => {
    const recipe = modalRecipe();
    recipe.slots = recipe.slots.filter((slot) => !("acceptsRemaining" in slot));

    expect(() =>
      placeCompositionSlots({
        children: [child("description", "content")],
        recipe,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_COMPOSITION_AMBIGUOUS",
      }),
    );
  });
});

function modalRecipe(): ReactCompositionRecipe {
  return {
    compositionId: "mui-dialog",
    rootComponentId: "mui.Dialog",
    slots: [
      {
        name: "heading",
        componentId: "mui.DialogTitle",
        acceptsRoles: ["heading"],
        cardinality: "zero-or-one",
      },
      {
        name: "body",
        componentId: "mui.DialogContent",
        acceptsRemaining: true,
        cardinality: "many",
      },
      {
        name: "actions",
        componentId: "mui.DialogActions",
        acceptsRoles: ["actionGroup"],
        cardinality: "zero-or-one",
      },
    ],
    provenance: { kind: "test", source: "test fixture" },
  };
}

function child(id: string, role: string): UiNodeV2 {
  return {
    id,
    kind: "group",
    role,
    sourceNodeIds: [`source-${id}`],
    layoutSourceNodeId: `source-${id}`,
    confidence: 1,
    evidence: [],
    children: [],
  };
}
