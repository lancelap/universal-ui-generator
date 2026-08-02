import { describe, expect, it } from "vitest";

import { fingerprintProjectContext } from "./fingerprint-context.js";
import { contextInputs } from "./test-fixtures.js";

describe("fingerprintProjectContext", () => {
  it("ignores JSON key order and operational time", () => {
    const first = fingerprintProjectContext(contextInputs());
    const reordered = contextInputs();
    reordered.config = {
      ...reordered.config,
      workspacePackages: { discovery: "public-exports" },
    };
    expect(fingerprintProjectContext(reordered)).toEqual(first);
  });

  it.each([
    "config",
    "mappings",
    "annotations",
    "policies",
    "publicComponents",
    "installedPackages",
    "designSystemPacks",
  ] as const)("changes when %s changes", (category) => {
    const beforeInput = contextInputs();
    const afterInput = contextInputs();
    if (category === "config") afterInput.config.ignore.push("**/generated/**");
    if (category === "mappings")
      afterInput.mappings.components[0]!.capabilities.push("value");
    if (category === "annotations")
      afterInput.annotations.components[0]!.summary = "Changed";
    if (category === "policies")
      afterInput.policies.resolution.allowNativeFallback = true;
    if (category === "publicComponents")
      afterInput.publicComponents.components[0]!.contract.acceptsChildren = true;
    if (category === "installedPackages")
      afterInput.installedPackages.packages[0]!.version = "2.0.1";
    if (category === "designSystemPacks")
      afterInput.designSystemPacks[0]!.version = "2.0.1";
    const before = fingerprintProjectContext(beforeInput);
    const after = fingerprintProjectContext(afterInput);
    expect(after.value).not.toBe(before.value);
  });
});
