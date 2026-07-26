import { describe, expect, it } from "vitest";

import { normalizeColor } from "./normalize-color.js";

describe("normalizeColor", () => {
  it("converts 0-255 RGB channels to uppercase hexadecimal", () => {
    expect(normalizeColor({ r: 208, g: 211, b: 216, a: 0.8 })).toEqual({
      color: "#D0D3D8",
      opacity: 0.8,
    });
  });

  it("rounds fractional RGB channels deterministically", () => {
    expect(normalizeColor({ r: 0.4, g: 127.5, b: 254.6, a: 1 })).toEqual({
      color: "#0080FF",
      opacity: 1,
    });
  });

  it.each([
    { r: -1, g: 0, b: 0, a: 1 },
    { r: 256, g: 0, b: 0, a: 1 },
    { r: 0, g: 0, b: 0, a: 2 },
    { r: Number.NaN, g: 0, b: 0, a: 1 },
  ])("rejects invalid channels", (color) => {
    expect(() => normalizeColor(color)).toThrowError(
      expect.objectContaining({ code: "DESIGN_DSL_UNSUPPORTED" }),
    );
  });
});
