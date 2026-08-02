import { describe, expect, it } from "vitest";

import {
  ProjectComponentSearchResultSchema,
  ProjectScanInputSchema,
  ProjectStatusResultSchema,
  compactProjectScanResult,
} from "../src/project-context-results.js";

const sha = "a".repeat(64);

describe("project context MCP schemas", () => {
  it("requires the complete reviewed discovery tuple", () => {
    expect(() =>
      ProjectScanInputSchema.parse({ acceptDiscoveredConfig: true }),
    ).toThrow();
    expect(() =>
      ProjectScanInputSchema.parse({ workspaceDir: "/tmp/x" }),
    ).toThrow();
  });

  it("rejects unsafe paths and unknown status fields", () => {
    expect(() =>
      ProjectStatusResultSchema.parse({
        status: "ready",
        changed: [],
        catalog: { path: "/Users/private/catalog.json", fingerprint: sha },
      }),
    ).toThrow();
    expect(() =>
      ProjectStatusResultSchema.parse({
        status: "missing",
        changed: [],
        secret: true,
      }),
    ).toThrow();
  });

  it("caps compact search results at fifty", () => {
    expect(() =>
      ProjectComponentSearchResultSchema.parse({
        catalogFingerprint: sha,
        catalogPath: ".ui-context/generated/effective-component-catalog.json",
        totalCount: 51,
        returnedCount: 51,
        truncated: false,
        results: Array.from({ length: 51 }, (_, index) => ({
          componentId: `project:@/ui#C${index}`,
          exportName: `C${index}`,
          import: { source: "@/ui", export: `C${index}`, style: "named" },
          score: 1,
          semantics: [],
        })),
      }),
    ).toThrow();
  });

  it("strips diagnostic evidence from discovery results", () => {
    const result = compactProjectScanResult({
      status: "needs-configuration",
      discoveryId: sha,
      proposedConfig: {
        schema: "ui-context-config/v1",
        framework: "react",
        language: "typescript",
        designSystemPacks: ["sber-space-ui"],
        componentRoots: [],
        iconRoots: [],
        workspacePackages: { discovery: "public-exports" },
        ignore: [],
      },
      diagnostics: [
        {
          severity: "warning",
          code: "WARN",
          message: "safe",
          evidence: { rawDsl: "secret" },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("rawDsl");
  });
});
