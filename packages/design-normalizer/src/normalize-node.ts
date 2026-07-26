import type { Appearance, DesignNode, Diagnostic } from "@uig/contracts";

import { normalizeEffects } from "./normalize-effect.js";
import { normalizeLayout } from "./normalize-layout.js";
import { normalizeBorders, normalizeFills } from "./normalize-paint.js";
import {
  finiteNumber,
  isRecord,
  type PixsoRecord,
  unsupported,
} from "./pixso-types.js";

export interface NormalizeNodeContext {
  artifactId: string;
  diagnostics: Diagnostic[];
}

type TextContent = NonNullable<DesignNode["text"]>;
type ComponentReference = NonNullable<DesignNode["component"]>;

export function pixsoNodeId(node: PixsoRecord): string {
  for (const field of ["guid", "componentId", "pathString"] as const) {
    const value = node[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  throw unsupported(
    "Pixso node does not contain guid, componentId, or pathString",
  );
}

export function normalizePixsoNode(
  node: PixsoRecord,
  childIds: string[],
  context: NormalizeNodeContext,
): DesignNode {
  const id = pixsoNodeId(node);
  const radius = finiteNumber(node.cornerRadius, "cornerRadius", 0);
  const appearance: Appearance = {
    fills: normalizeFills(node.fills, {
      artifactId: context.artifactId,
      nodeId: id,
      diagnostics: context.diagnostics,
    }),
    borders: normalizeBorders(node, {
      artifactId: context.artifactId,
      nodeId: id,
      diagnostics: context.diagnostics,
    }),
    radii: {
      topLeft: radius,
      topRight: radius,
      bottomRight: radius,
      bottomLeft: radius,
    },
    shadows: normalizeEffects(node.effects),
    opacity: finiteNumber(node.opacity, "opacity", 1),
  };
  const layout = normalizeLayout(node.autoLayout);
  const text = normalizeText(node);
  const component = normalizeComponent(node);

  return {
    id,
    type:
      typeof node.type === "string" && node.type.length > 0
        ? node.type.toLowerCase()
        : "unknown",
    name: typeof node.name === "string" ? node.name : "",
    visible: node.visible !== false,
    children: childIds,
    geometry: {
      x: finiteNumber(node.left, "left"),
      y: finiteNumber(node.top, "top"),
      width: nonNegative(node.width, "width"),
      height: nonNegative(node.height, "height"),
    },
    appearance,
    source: { provider: "pixso", nodeId: id },
    ...(layout ? { layout } : {}),
    ...(text ? { text } : {}),
    ...(component ? { component } : {}),
  };
}

function nonNegative(value: unknown, field: string): number {
  const number = finiteNumber(value, field);
  if (number < 0) {
    throw unsupported(`Pixso ${field} cannot be negative`);
  }
  return number;
}

function normalizeText(node: PixsoRecord): TextContent | undefined {
  if (typeof node.nodeText !== "string") {
    return undefined;
  }
  return {
    value: node.nodeText,
    ...optionalNumber(node.fontSize, "fontSize"),
  };
}

function optionalNumber(
  value: unknown,
  field: string,
): { fontSize: number } | Record<string, never> {
  return value === undefined ? {} : { fontSize: nonNegative(value, field) };
}

function normalizeComponent(node: PixsoRecord): ComponentReference | undefined {
  if (typeof node.componentKey !== "string" || node.componentKey.length === 0) {
    return undefined;
  }

  return {
    key: node.componentKey,
    ...(typeof node.componentNormName === "string"
      ? { variant: node.componentNormName }
      : {}),
    ...(isRecord(node.props) ? { properties: node.props } : {}),
  };
}
