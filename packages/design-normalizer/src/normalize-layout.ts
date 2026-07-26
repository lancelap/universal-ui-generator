import type { Layout } from "@uig/contracts";

import { finiteNumber, isRecord } from "./pixso-types.js";

export function normalizeLayout(value: unknown): Layout | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const stackMode =
    typeof value.stackMode === "string" ? value.stackMode.toUpperCase() : "";
  const mode =
    stackMode === "VERTICAL"
      ? ("vertical" as const)
      : stackMode === "HORIZONTAL"
        ? ("horizontal" as const)
        : ("none" as const);

  return {
    mode,
    gap: finiteNumber(
      value.autoLayoutCounterItemSpacing,
      "autoLayout.autoLayoutCounterItemSpacing",
      0,
    ),
    padding: {
      top: finiteNumber(
        value.autoLayoutPaddingTop,
        "autoLayout.autoLayoutPaddingTop",
        0,
      ),
      right: finiteNumber(
        value.autoLayoutPaddingRight,
        "autoLayout.autoLayoutPaddingRight",
        0,
      ),
      bottom: finiteNumber(
        value.autoLayoutPaddingBottom,
        "autoLayout.autoLayoutPaddingBottom",
        0,
      ),
      left: finiteNumber(
        value.autoLayoutPaddingLeft,
        "autoLayout.autoLayoutPaddingLeft",
        0,
      ),
    },
    alignItems: normalizeEnum(value.autoLayoutCounterAxisAlignItems),
    ...(typeof value.autoLayoutPrimaryAxisAlignItems === "string"
      ? {
          justifyContent: normalizeEnum(value.autoLayoutPrimaryAxisAlignItems),
        }
      : {}),
  };
}

function normalizeEnum(value: unknown): string {
  return typeof value === "string" && value.length > 0
    ? value.toLowerCase()
    : "unspecified";
}
