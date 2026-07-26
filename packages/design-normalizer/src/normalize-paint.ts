import type { Appearance, Diagnostic } from "@uig/contracts";

import { normalizeColor } from "./normalize-color.js";
import {
  DesignNormalizationError,
  finiteNumber,
  isRecord,
  type PixsoRecord,
} from "./pixso-types.js";

export interface NormalizationContext {
  artifactId: string;
  nodeId: string;
  diagnostics: Diagnostic[];
}

type Fill = Appearance["fills"][number];
type Border = Appearance["borders"][number];

export function normalizeFills(
  value: unknown,
  context: NormalizationContext,
): Fill[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((paint): Fill[] => {
    if (!isRecord(paint) || paint.visible === false) {
      return [];
    }
    const opacity = readPaintOpacity(paint);
    const type = typeof paint.type === "string" ? paint.type.toUpperCase() : "";

    if (type === "SOLID") {
      const color = normalizeColor(paint.color);
      return [
        {
          type: "solid" as const,
          color: color.color,
          opacity: color.opacity * opacity,
        },
      ];
    }
    if (type.includes("GRADIENT")) {
      return [{ type: "gradient" as const, opacity }];
    }
    if (type === "IMAGE") {
      return [{ type: "image" as const, opacity }];
    }

    context.diagnostics.push({
      severity: "warning",
      blocking: false,
      stage: "normalization",
      code: "DESIGN_PAINT_UNSUPPORTED",
      message: `Unsupported Pixso paint type: ${type || "unknown"}`,
      source: {
        artifactId: context.artifactId,
        nodeId: context.nodeId,
      },
    });
    return [{ type: "unsupported" as const, opacity }];
  });
}

export function normalizeBorders(
  node: PixsoRecord,
  context: NormalizationContext,
): Border[] {
  if (!Array.isArray(node.strokePaints)) {
    return [];
  }

  const weight = finiteNumber(node.strokeWeight, "strokeWeight", 1);
  const position = normalizeStrokePosition(node.strokeAlign);

  return node.strokePaints.flatMap((paint) => {
    if (!isRecord(paint) || paint.visible === false) {
      return [];
    }
    if (
      typeof paint.type !== "string" ||
      paint.type.toUpperCase() !== "SOLID"
    ) {
      context.diagnostics.push({
        severity: "warning",
        blocking: false,
        stage: "normalization",
        code: "DESIGN_PAINT_UNSUPPORTED",
        message: "Only solid Pixso strokes can be represented as borders",
        source: {
          artifactId: context.artifactId,
          nodeId: context.nodeId,
        },
      });
      return [];
    }

    const color = normalizeColor(paint.color);
    return [
      {
        position,
        width: { top: weight, right: weight, bottom: weight, left: weight },
        style: "solid" as const,
        color: color.color,
        opacity: color.opacity * readPaintOpacity(paint),
      },
    ];
  });
}

function readPaintOpacity(paint: PixsoRecord): number {
  const opacity = finiteNumber(paint.opacity, "paint.opacity", 1);
  if (opacity < 0 || opacity > 1) {
    throw new DesignNormalizationError(
      "DESIGN_DSL_UNSUPPORTED",
      "Pixso paint opacity must be between 0 and 1",
    );
  }
  return opacity;
}

function normalizeStrokePosition(
  value: unknown,
): "inside" | "outside" | "center" {
  switch (typeof value === "string" ? value.toUpperCase() : "CENTER") {
    case "INSIDE":
      return "inside";
    case "OUTSIDE":
      return "outside";
    default:
      return "center";
  }
}
