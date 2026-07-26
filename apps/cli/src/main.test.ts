import { describe, expect, it } from "vitest";

import { cliVersion } from "./main.js";

describe("CLI workspace", () => {
  it("exports the root package version", () => {
    expect(cliVersion).toBe("0.1.0");
  });
});
