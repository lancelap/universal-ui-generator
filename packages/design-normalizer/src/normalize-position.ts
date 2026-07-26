import type { LayoutPosition } from "@uig/contracts";

import {
  finiteNumber,
  isRecord,
  type PixsoRecord,
  unsupported,
} from "./pixso-types.js";

export function normalizePosition(
  node: PixsoRecord,
): LayoutPosition | undefined {
  const nestedFact = isRecord(node.autoLayout)
    ? node.autoLayout.autoLayoutItemAbsolutePos
    : undefined;
  const directFact = node.autoLayoutAbsolutePos;

  if (directFact === undefined && nestedFact === undefined) {
    return undefined;
  }
  if (
    (directFact !== undefined && typeof directFact !== "boolean") ||
    (nestedFact !== undefined && typeof nestedFact !== "boolean")
  ) {
    throw unsupported("Pixso auto-layout positioning fact must be a boolean");
  }
  if (
    directFact !== undefined &&
    nestedFact !== undefined &&
    directFact !== nestedFact
  ) {
    throw unsupported("Pixso auto-layout positioning facts contradict");
  }

  const isAbsolute = (directFact ?? nestedFact) as boolean;
  if (!isAbsolute) {
    return { mode: "flow" };
  }

  return {
    mode: "absolute",
    inset: {
      top: finiteNumber(node.top, "top"),
      left: finiteNumber(node.left, "left"),
    },
  };
}
