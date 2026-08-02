import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { loadDesignSystemPackV2 } from "@uig/component-catalog";

import { buildEffectiveComponentCatalog } from "./build-effective-catalog.js";
import { fingerprintProjectContext } from "./fingerprint-context.js";
import {
  getComponentContractFromCatalog,
  getIconPathsFromCatalog,
  searchProjectContextCatalog,
} from "./query-project-context.js";
import { contextInputs } from "./test-fixtures.js";

async function catalog() {
  const inputs = contextInputs();
  const pack = await loadDesignSystemPackV2(
    resolve("design-system-packs/sber-space-ui"),
  );
  return buildEffectiveComponentCatalog({
    fingerprint: fingerprintProjectContext(inputs),
    publicComponents: inputs.publicComponents,
    mappings: inputs.mappings,
    annotations: inputs.annotations,
    policies: inputs.policies,
    installedPackages: inputs.installedPackages,
    packs: [pack],
  });
}

describe("project context queries", () => {
  it("scores exact role and export deterministically", async () => {
    const value = await catalog();
    const role = searchProjectContextCatalog(value, {
      semanticRole: "choicePanel",
      limit: 20,
    });
    expect(role.results[0]).toMatchObject({
      componentId: "base.RadioGroup",
      score: 1000,
    });
    const named = searchProjectContextCatalog(value, {
      query: "AppRadioGroup",
      limit: 20,
    });
    expect(named.results[0]).toMatchObject({
      componentId: "project:@/shared/ui#AppRadioGroup",
      score: 900,
    });
    expect(named.catalogFingerprint).toBe(value.fingerprint.value);
  });

  it("returns at most fifty compact results and points to the catalog", async () => {
    const value = await catalog();
    value.components = Array.from({ length: 168 }, (_, index) => ({
      ...structuredClone(value.components[0]!),
      id: `project:@/generated#Component${String(index).padStart(3, "0")}`,
      import: {
        source: "@/generated",
        export: `Component${String(index).padStart(3, "0")}`,
        style: "named" as const,
      },
      contractRef: {
        artifact: "public-components" as const,
        id: `project:@/generated#Component${String(index).padStart(3, "0")}`,
      },
    }));
    const result = searchProjectContextCatalog(value, { query: "Component", limit: 50 });
    expect(result).toMatchObject({ totalCount: 168, returnedCount: 50, truncated: true });
    expect(result.catalogPath).toBe(".ui-context/generated/effective-component-catalog.json");
  });

  it("returns one exact contract and never a nearest component", async () => {
    const value = await catalog();
    expect(
      getComponentContractFromCatalog(value, {
        componentId: "project:@/shared/ui#AppRadioGroup",
      }),
    ).toMatchObject({
      componentId: "project:@/shared/ui#AppRadioGroup",
      import: { source: "@/shared/ui", export: "AppRadioGroup" },
      catalogFingerprint: value.fingerprint.value,
    });
    expect(() =>
      getComponentContractFromCatalog(value, {
        componentId: "project:@/shared/ui#AppRadioGrou",
      }),
    ).toThrowError(expect.objectContaining({ code: "PROJECT_COMPONENT_NOT_FOUND" }));
  });

  it("resolves only exact icons and keeps fuzzy names unresolved", async () => {
    const value = await catalog();
    value.icons = [
      {
        id: "project:@/icons#Upload",
        availability: "verified",
        import: { source: "@/icons", export: "Upload", style: "named" },
        aliases: ["UploadFile"],
        contractRef: { artifact: "public-components", id: "project:@/icons#Upload" },
      },
    ];
    expect(getIconPathsFromCatalog(value, { names: ["Upload", "Uplod"] }).results).toEqual([
      expect.objectContaining({ name: "Upload", status: "resolved", import: { source: "@/icons", export: "Upload", style: "named" } }),
      expect.objectContaining({ name: "Uplod", status: "unresolved" }),
    ]);
  });
});
