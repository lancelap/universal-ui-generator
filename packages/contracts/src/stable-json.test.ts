import { describe, expect, it } from "vitest";

import { stableStringify } from "./index.js";

describe("stableStringify", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(
      stableStringify({
        z: 1,
        a: { d: 2, b: 1 },
        list: [{ z: 2, a: 1 }, "second"],
      }),
    ).toBe(
      '{\n  "a": {\n    "b": 1,\n    "d": 2\n  },\n  "list": [\n    {\n      "a": 1,\n      "z": 2\n    },\n    "second"\n  ],\n  "z": 1\n}\n',
    );
  });

  it.each([
    ["undefined", { value: undefined }],
    ["function", { value: () => true }],
    ["symbol", { value: Symbol("value") }],
    ["non-finite number", { value: Number.POSITIVE_INFINITY }],
  ])("rejects %s", (_name, value) => {
    expect(() => stableStringify(value)).toThrow();
  });

  it("rejects circular objects", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => stableStringify(circular)).toThrow(/circular/i);
  });
});
