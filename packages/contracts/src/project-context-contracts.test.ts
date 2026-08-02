import { describe, expect, it } from "vitest";

import {
  assertEffectiveComponentCatalogV1Integrity,
  assertPublicComponentsV1Integrity,
  EffectiveComponentCatalogV1Schema,
  ProjectComponentPoliciesV1Schema,
  PublicComponentsV1Schema,
  UiContextConfigV1Schema,
  validateWithSchema,
} from "./index.js";
import type {
  EffectiveComponentCatalogV1,
  PublicComponentsV1,
} from "./index.js";

const hash = "a".repeat(64);

function validConfig() {
  return {
    schema: "ui-context-config/v1" as const,
    framework: "react" as const,
    language: "typescript" as const,
    designSystemPacks: ["sber-space-ui"],
    componentRoots: [
      {
        path: "src/shared/ui",
        entry: "src/shared/ui/index.ts",
        importSource: "@/shared/ui",
      },
    ],
    iconRoots: [],
    workspacePackages: { discovery: "public-exports" as const },
    ignore: ["**/*.test.*"],
  };
}

function validPolicies() {
  return {
    schema: "project-component-policies/v1" as const,
    resolution: {
      allowSuggested: false as const,
      allowNativeFallback: false,
      preferProjectComponents: true as const,
    },
    components: { excluded: [], deprecatedAllowed: false },
    imports: {
      preferPublicFacades: true as const,
      allowDeepImports: false as const,
    },
  };
}

function validPublicComponents(): PublicComponentsV1 {
  return {
    schema: "public-components/v1" as const,
    components: [
      {
        id: "project:@/shared/ui#Button",
        kind: "react-component" as const,
        framework: "react" as const,
        availability: "verified" as const,
        import: {
          source: "@/shared/ui",
          export: "Button",
          style: "named" as const,
        },
        contract: {
          propsType: "ButtonProps",
          acceptsChildren: true,
          props: [
            {
              name: "disabled",
              required: false,
              type: { kind: "boolean" as const },
              deprecated: false,
            },
          ],
        },
        semantics: [],
        capabilities: [],
        formAdapters: [],
        evidence: [
          {
            kind: "public-export" as const,
            path: "src/shared/ui/index.ts",
            export: "Button",
          },
        ],
      },
    ],
    icons: [],
    diagnostics: [],
  };
}

function validEffectiveCatalog(): EffectiveComponentCatalogV1 {
  return {
    schema: "effective-component-catalog/v1" as const,
    framework: "react" as const,
    language: "typescript" as const,
    fingerprint: {
      algorithm: "sha256" as const,
      value: hash,
      inputs: {
        config: hash,
        project: hash,
        mappings: hash,
        annotations: hash,
        policies: hash,
        lockfile: hash,
        installedPackages: hash,
        designSystemPacks: { "sber-space-ui@2.0.0": hash },
      },
    },
    artifacts: {
      publicComponents: {
        path: ".ui-context/generated/public-components.json",
        sha256: hash,
      },
      installedPackages: {
        path: ".ui-context/generated/installed-packages.json",
        sha256: hash,
      },
      diagnostics: {
        path: ".ui-context/generated/diagnostics.json",
        sha256: hash,
      },
    },
    sources: [
      {
        kind: "project" as const,
        id: "project",
        version: "1",
        sha256: hash,
      },
      {
        kind: "design-system-pack" as const,
        id: "sber-space-ui",
        version: "2.0.0",
        sha256: hash,
      },
    ],
    components: [
      {
        id: "project:@/shared/ui#Button",
        availability: "verified" as const,
        import: {
          source: "@/shared/ui",
          export: "Button",
          style: "named" as const,
        },
        contractRef: {
          artifact: "public-components" as const,
          id: "project:@/shared/ui#Button",
        },
        semantics: [
          {
            role: "primaryAction",
            status: "suggested" as const,
            confidence: 0.8,
            source: ".ui-context/generated/public-components.json",
          },
        ],
        capabilities: [],
        formAdapters: [],
        annotations: [],
        restrictions: [],
        deprecated: false,
      },
    ],
    icons: [],
    diagnostics: [],
    summary: {
      verifiedComponents: 1,
      mappedRoles: 0,
      suggestedRoles: 1,
      verifiedIcons: 0,
      warnings: 0,
    },
  };
}

describe("project context contracts", () => {
  it("accepts one public facade config for one selected pack", () => {
    const value = validateWithSchema(UiContextConfigV1Schema, validConfig());
    expect(value.componentRoots[0]?.importSource).toBe("@/shared/ui");
  });

  it.each(["/tmp/ui", "../ui", "src/../secret", "C:\\ui"])(
    "rejects unsafe context path %j",
    (path) => {
      expect(() =>
        validateWithSchema(UiContextConfigV1Schema, {
          ...validConfig(),
          componentRoots: [
            { path, entry: "src/ui/index.ts", importSource: "@/ui" },
          ],
        }),
      ).toThrow();
    },
  );

  it.each(["./ui", "../ui"])("rejects relative import source %j", (source) => {
    expect(() =>
      validateWithSchema(UiContextConfigV1Schema, {
        ...validConfig(),
        componentRoots: [
          { path: "src/ui", entry: "src/ui/index.ts", importSource: source },
        ],
      }),
    ).toThrow();
  });

  it("rejects unknown fields in human configuration", () => {
    expect(() =>
      validateWithSchema(UiContextConfigV1Schema, {
        ...validConfig(),
        unreviewed: true,
      }),
    ).toThrow();
  });

  it.each([
    ["allowSuggested", true],
    ["preferProjectComponents", false],
  ] as const)("rejects unsafe resolution policy %s", (key, value) => {
    expect(() =>
      validateWithSchema(ProjectComponentPoliciesV1Schema, {
        ...validPolicies(),
        resolution: { ...validPolicies().resolution, [key]: value },
      }),
    ).toThrow();
  });

  it("rejects deep imports", () => {
    expect(() =>
      validateWithSchema(ProjectComponentPoliciesV1Schema, {
        ...validPolicies(),
        imports: { ...validPolicies().imports, allowDeepImports: true },
      }),
    ).toThrow();
  });

  it("accepts all four scan diagnostic severities", () => {
    for (const severity of ["info", "warning", "error", "fatal"] as const) {
      const value = validPublicComponents();
      value.diagnostics.push({
        severity,
        code: "SCAN_EVIDENCE",
        message: "evidence",
      });
      expect(() =>
        validateWithSchema(PublicComponentsV1Schema, value),
      ).not.toThrow();
    }
  });

  it("rejects 63-character hashes", () => {
    const catalog = validEffectiveCatalog();
    catalog.fingerprint.value = "a".repeat(63);
    expect(() =>
      validateWithSchema(EffectiveComponentCatalogV1Schema, catalog),
    ).toThrow();
  });

  it("rejects duplicate public component IDs", () => {
    const value = validPublicComponents();
    value.components.push(structuredClone(value.components[0]!));
    expect(() => assertPublicComponentsV1Integrity(value)).toThrow(
      /duplicate/i,
    );
  });

  it("rejects an effective component without contractRef", () => {
    const catalog = validEffectiveCatalog() as Record<string, unknown>;
    const components = catalog.components as Array<Record<string, unknown>>;
    delete components[0]!.contractRef;
    expect(() =>
      validateWithSchema(EffectiveComponentCatalogV1Schema, catalog),
    ).toThrow();
  });

  it("rejects duplicate pack sources", () => {
    const catalog = validEffectiveCatalog();
    catalog.sources.push(structuredClone(catalog.sources[1]!));
    expect(() => assertEffectiveComponentCatalogV1Integrity(catalog)).toThrow(
      /duplicate/i,
    );
  });

  it("rejects a contract reference to another component", () => {
    const catalog = validEffectiveCatalog();
    const contractRef = catalog.components[0]!.contractRef;
    expect(contractRef.artifact).toBe("public-components");
    if (contractRef.artifact === "public-components") {
      contractRef.id = "project:@/shared/ui#Missing";
    }
    expect(() => assertEffectiveComponentCatalogV1Integrity(catalog)).toThrow(
      /contractRef/i,
    );
  });

  it("rejects an effective catalog with incorrect summary counts", () => {
    const catalog = validEffectiveCatalog();
    catalog.summary.verifiedComponents = 99;
    expect(() => assertEffectiveComponentCatalogV1Integrity(catalog)).toThrow(
      /verifiedComponents/,
    );
  });
});
