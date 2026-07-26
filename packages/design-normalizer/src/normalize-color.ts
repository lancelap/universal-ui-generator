import { finiteNumber, isRecord, unsupported } from "./pixso-types.js";

export interface NormalizedColor {
  color: string;
  opacity: number;
}

export function normalizeColor(input: unknown): NormalizedColor {
  if (!isRecord(input)) {
    throw unsupported("Pixso color must be an object");
  }

  const r = colorChannel(input.r, "color.r");
  const g = colorChannel(input.g, "color.g");
  const b = colorChannel(input.b, "color.b");
  const opacity = finiteNumber(input.a, "color.a", 1);
  if (opacity < 0 || opacity > 1) {
    throw unsupported("Pixso alpha must be between 0 and 1");
  }

  return {
    color: `#${hex(r)}${hex(g)}${hex(b)}`,
    opacity,
  };
}

function colorChannel(value: unknown, field: string): number {
  const channel = finiteNumber(value, field);
  if (channel < 0 || channel > 255) {
    throw unsupported(`Pixso ${field} must be between 0 and 255`);
  }
  return Math.round(channel);
}

function hex(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}
