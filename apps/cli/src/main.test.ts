import { describe, expect, it } from "vitest";

import { cliVersion, normalizeCliArgv } from "./main.js";

describe("CLI workspace", () => {
  it("exports the root package version", () => {
    expect(cliVersion).toBe("0.1.0");
  });

  it("accepts the conventional package-script argument separator", () => {
    expect(
      normalizeCliArgv(["node", "uig", "--", "pack", "validate", "./pack"]),
    ).toEqual(["node", "uig", "pack", "validate", "./pack"]);
  });
});
