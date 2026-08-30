import { describe, expect, it } from "vitest";

import {
  UigAgenticRunStatusSchema,
  UigPrepareBuildInputSchema,
  UigPrepareBuildResultSchema,
  UigRecordBrowserReviewInputSchema,
  UigRecordBrowserReviewResultSchema,
  UigRecordCodeReviewInputSchema,
  UigRecordCodeReviewResultSchema,
  UigRecordImplementationInputSchema,
  UigRecordImplementationResultSchema,
  validateWithSchema,
} from "./index.js";

const sha = "a".repeat(64);

describe("UigPrepareBuild contract", () => {
  it("accepts a Pixso URL source", () => {
    const result = validateWithSchema(UigPrepareBuildInputSchema, {
      source: {
        kind: "pixso-url",
        url: "https://pixso.net/app/design/abc?item-id=4:314",
        designSystem: "sber-space-ui",
      },
    });
    expect(result.source.kind).toBe("pixso-url");
  });

  it("rejects an unsafe local-dsl path", () => {
    expect(() =>
      validateWithSchema(UigPrepareBuildInputSchema, {
        source: {
          kind: "local-dsl",
          path: "../etc/passwd",
          designSystem: "sber-space-ui",
        },
      }),
    ).toThrowError();
  });

  it("round-trips a ready result", () => {
    const result = validateWithSchema(UigPrepareBuildResultSchema, {
      schema: "uig-qwen-prepare-build-result/v1",
      status: "ready",
      runId: "run_test",
      runPath: ".uig/runs/run_test",
      sourceKind: "pixso-url",
      designEvidencePath: ".uig/runs/run_test/design-evidence.json",
      projectContextPath:
        ".ui-context/generated/effective-component-catalog.json",
      designSystem: "sber-space-ui",
      designSystemVersion: "1.0.0",
      packSha256: sha,
      reusableComponents: [
        {
          componentId: "Btn",
          exportName: "Button",
          importSource: "@scope/ui",
          status: "pack-owned",
          semanticRoles: ["button"],
        },
      ],
      diagnostics: [],
    });
    expect(result.reusableComponents).toHaveLength(1);
  });
});

describe("UigRecordImplementation contract", () => {
  it("accepts a written implementation", () => {
    const result = validateWithSchema(UigRecordImplementationInputSchema, {
      runId: "run_test",
      status: "written",
      pagePath: "src/pages/Home.tsx",
      previewPath: "src/pages/Home.preview.tsx",
      previewUrlPath: "/preview/home",
      previewCommand: "vite",
      createdFiles: [{ path: "src/pages/Home.tsx", sha256: sha, kind: "page" }],
      modifiedFiles: [],
      importedComponents: [
        {
          componentId: "Btn",
          importSource: "@scope/ui",
          exportName: "Button",
        },
      ],
      assumptions: [],
      residualErrors: [],
    });
    expect(result.status).toBe("written");
  });

  it("rejects relative-path escapes in created files", () => {
    expect(() =>
      validateWithSchema(UigRecordImplementationInputSchema, {
        runId: "run_test",
        status: "written",
        pagePath: "src/pages/Home.tsx",
        previewPath: "src/pages/Home.preview.tsx",
        previewUrlPath: "/preview/home",
        previewCommand: "vite",
        createdFiles: [
          { path: "../outside/run.json", sha256: sha, kind: "page" },
        ],
        modifiedFiles: [],
        importedComponents: [],
        assumptions: [],
        residualErrors: [],
      }),
    ).toThrowError();
  });
});

describe("UigRecordCodeReview contract", () => {
  it("accepts an approved-with-fixes verdict", () => {
    const result = validateWithSchema(UigRecordCodeReviewInputSchema, {
      runId: "run_test",
      verdict: "approved-with-fixes",
      tsc: "passed",
      lint: "passed",
      autoFixed: [],
      remainingIssues: [],
    });
    expect(result.verdict).toBe("approved-with-fixes");
  });
});

describe("UigRecordBrowserReview contract", () => {
  it("requires at least one screenshot", () => {
    expect(() =>
      validateWithSchema(UigRecordBrowserReviewInputSchema, {
        runId: "run_test",
        verdict: "ok",
        devServerCommand: "vite",
        previewUrl: "http://localhost:5173/preview/home",
        screenshots: [],
        unresolvedErrors: [],
        runtimeFixes: [],
      }),
    ).toThrowError();
  });

  it("accepts a clean run with two screenshots", () => {
    const result = validateWithSchema(UigRecordBrowserReviewInputSchema, {
      runId: "run_test",
      verdict: "ok",
      devServerCommand: "vite",
      previewUrl: "http://localhost:5173/preview/home",
      screenshots: [
        {
          viewport: "desktop",
          path: ".uig/runs/run_test/desktop.png",
          sha256: sha,
        },
        {
          viewport: "narrow",
          path: ".uig/runs/run_test/narrow.png",
          sha256: sha,
        },
      ],
      unresolvedErrors: [],
      runtimeFixes: [],
    });
    expect(result.screenshots).toHaveLength(2);
  });
});

describe("UigAgenticRunStatus union", () => {
  it("lists every documented state", () => {
    const states = [
      "pending",
      "implementation-recorded",
      "code-review-recorded",
      "browser-review-recorded",
      "complete",
      "partial-success",
      "generated-with-errors",
      "blocked",
      "cancelled",
    ];
    for (const state of states) {
      expect(() =>
        validateWithSchema(UigAgenticRunStatusSchema, state),
      ).not.toThrow();
    }
  });
});

describe("Record result contracts", () => {
  it("shapes an implementation result with rejection", () => {
    const result = validateWithSchema(UigRecordImplementationResultSchema, {
      schema: "uig-qwen-record-implementation-result/v1",
      runId: "run_test",
      runStatus: "blocked",
      reportPath: ".uig/runs/run_test/agentic/implementation.json",
      reportSha256: sha,
      importedComponents: [],
      accepted: false,
      rejection: {
        code: "UIG_IMPLEMENTATION_OUT_OF_SCOPE",
        message: "Out of scope",
      },
    });
    expect(result.accepted).toBe(false);
  });

  it("shapes a code-review result", () => {
    const result = validateWithSchema(UigRecordCodeReviewResultSchema, {
      schema: "uig-qwen-record-code-review-result/v1",
      runId: "run_test",
      runStatus: "code-review-recorded",
      reportPath: ".uig/runs/run_test/agentic/code-review.json",
      reportSha256: sha,
      accepted: true,
    });
    expect(result.runStatus).toBe("code-review-recorded");
  });

  it("shapes a browser-review result", () => {
    const result = validateWithSchema(UigRecordBrowserReviewResultSchema, {
      schema: "uig-qwen-record-browser-review-result/v1",
      runId: "run_test",
      runStatus: "complete",
      reportPath: ".uig/runs/run_test/agentic/browser-review.json",
      reportSha256: sha,
      accepted: true,
    });
    expect(result.runStatus).toBe("complete");
  });
});
