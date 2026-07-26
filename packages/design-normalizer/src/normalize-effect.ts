import type { Appearance } from "@uig/contracts";

import { normalizeColor } from "./normalize-color.js";
import { finiteNumber, isRecord } from "./pixso-types.js";

type Shadow = Appearance["shadows"][number];

export function normalizeEffects(value: unknown): Shadow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((effect) => {
    if (
      !isRecord(effect) ||
      effect.visible === false ||
      effect.type !== "DROP_SHADOW"
    ) {
      return [];
    }

    const offset = isRecord(effect.offset) ? effect.offset : {};
    const color = normalizeColor(effect.color);
    return [
      {
        type: "drop" as const,
        x: finiteNumber(offset.x, "effect.offset.x", 0),
        y: finiteNumber(offset.y, "effect.offset.y", 0),
        blur: finiteNumber(effect.radius, "effect.radius", 0),
        spread: finiteNumber(effect.spread, "effect.spread", 0),
        color: color.color,
        opacity: color.opacity,
      },
    ];
  });
}
