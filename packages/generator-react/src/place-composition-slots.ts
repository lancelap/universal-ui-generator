import type { ReactCompositionRecipe, UiNodeV2 } from "@uig/contracts";

import { ReactGenerationError } from "./errors.js";

export interface PlacedCompositionSlot {
  name: string;
  componentId: string;
  children: UiNodeV2[];
}

export interface PlacedComposition {
  compositionId: string;
  slots: PlacedCompositionSlot[];
}

export function placeCompositionSlots(input: {
  children: UiNodeV2[];
  recipe: ReactCompositionRecipe;
}): PlacedComposition {
  const remainingSlots = input.recipe.slots.filter(
    (slot) => "acceptsRemaining" in slot,
  );
  if (remainingSlots.length > 1) {
    ambiguous(
      `Composition ${input.recipe.compositionId} has multiple remaining slots`,
    );
  }

  const placed = new Map(
    input.recipe.slots.map((slot) => [slot.name, [] as UiNodeV2[]]),
  );
  for (const child of input.children) {
    const explicit = input.recipe.slots.filter(
      (slot) =>
        "acceptsRoles" in slot && slot.acceptsRoles.includes(child.role),
    );
    if (explicit.length > 1) {
      ambiguous(
        `Child ${child.id} matches multiple slots in ${input.recipe.compositionId}`,
      );
    }
    const target = explicit[0] ?? remainingSlots[0];
    if (!target) {
      ambiguous(
        `Child ${child.id} has no slot in ${input.recipe.compositionId}`,
      );
    }
    placed.get(target.name)!.push(child);
  }

  for (const slot of input.recipe.slots) {
    const count = placed.get(slot.name)!.length;
    const valid =
      slot.cardinality === "many" ||
      (slot.cardinality === "zero-or-one" && count <= 1) ||
      (slot.cardinality === "exactly-one" && count === 1) ||
      (slot.cardinality === "one-or-more" && count >= 1);
    if (!valid) {
      ambiguous(
        `Slot ${slot.name} in ${input.recipe.compositionId} violates ${slot.cardinality}`,
      );
    }
  }

  return {
    compositionId: input.recipe.compositionId,
    slots: input.recipe.slots.map((slot) => ({
      name: slot.name,
      componentId: slot.componentId,
      children: placed.get(slot.name)!,
    })),
  };
}

function ambiguous(message: string): never {
  throw new ReactGenerationError("GENERATION_COMPOSITION_AMBIGUOUS", message);
}
