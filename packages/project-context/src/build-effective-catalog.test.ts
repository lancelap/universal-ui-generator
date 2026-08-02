import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadDesignSystemPackV2 } from "@uig/component-catalog";

import { buildEffectiveComponentCatalog } from "./build-effective-catalog.js";
import { fingerprintProjectContext } from "./fingerprint-context.js";
import { contextInputs } from "./test-fixtures.js";

const packDirectory = resolve("design-system-packs/sber-space-ui");

describe("buildEffectiveComponentCatalog", () => {
  it("keeps suggestions non-authoritative and applies reviewed mappings", async () => {
    const inputs = contextInputs();
    const pack = await loadDesignSystemPackV2(packDirectory);
    const catalog = buildEffectiveComponentCatalog({
      fingerprint: fingerprintProjectContext(inputs),
      publicComponents: inputs.publicComponents,
      mappings: inputs.mappings,
      annotations: inputs.annotations,
      policies: inputs.policies,
      installedPackages: inputs.installedPackages,
      packs: [pack],
    });
    const component = catalog.components.find(
      (entry) => entry.id === "project:@/shared/ui#AppRadioGroup",
    )!;
    expect(component.semantics).toContainEqual({
      role: "choicePanel",
      status: "mapped",
      confidence: 1,
      source: ".ui-context/mappings.json",
    });
    expect(component.annotations).toEqual(["Single selection"]);
    expect(catalog.summary).toMatchObject({
      verifiedComponents: expect.any(Number),
      mappedRoles: 1,
    });
  });

  it("does not expose pack imports without installed package/export proof", async () => {
    const inputs = contextInputs();
    inputs.installedPackages.packages = [];
    const pack = await loadDesignSystemPackV2(packDirectory);
    const catalog = buildEffectiveComponentCatalog({
      fingerprint: fingerprintProjectContext(inputs),
      publicComponents: inputs.publicComponents,
      mappings: inputs.mappings,
      annotations: inputs.annotations,
      policies: inputs.policies,
      installedPackages: inputs.installedPackages,
      packs: [pack],
    });
    expect(
      catalog.components.some((entry) => entry.id === "base.RadioGroup"),
    ).toBe(false);
  });

  it("exposes a pack import only when public package types prove the export", async () => {
    const inputs = contextInputs();
    const pack = await loadDesignSystemPackV2(packDirectory);
    const catalog = buildEffectiveComponentCatalog({
      fingerprint: fingerprintProjectContext(inputs),
      publicComponents: inputs.publicComponents,
      mappings: inputs.mappings,
      annotations: inputs.annotations,
      policies: inputs.policies,
      installedPackages: inputs.installedPackages,
      packs: [pack],
    });
    expect(catalog.components).toContainEqual(
      expect.objectContaining({
        id: "base.RadioGroup",
        import: {
          source: "@sber-space-ui/radio",
          export: "RadioGroup",
          style: "named",
        },
        semantics: expect.arrayContaining([
          expect.objectContaining({
            role: "choicePanel",
            status: "pack-owned",
          }),
        ]),
      }),
    );
  });

  it("rejects a human mapping to an absent verified component", async () => {
    const inputs = contextInputs();
    inputs.mappings.components[0]!.componentId = "project:@/shared/ui#Missing";
    const pack = await loadDesignSystemPackV2(packDirectory);
    expect(() =>
      buildEffectiveComponentCatalog({
        fingerprint: fingerprintProjectContext(inputs),
        publicComponents: inputs.publicComponents,
        mappings: inputs.mappings,
        annotations: inputs.annotations,
        policies: inputs.policies,
        installedPackages: inputs.installedPackages,
        packs: [pack],
      }),
    ).toThrow(/MAPPING_TARGET_NOT_FOUND/);
  });
});
