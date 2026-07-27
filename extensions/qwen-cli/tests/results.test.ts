import type {
  DesignSnapshot,
  Diagnostic,
  GenerationRun,
  ReactGenerationReport,
  ResolutionPlanV2,
} from "@uig/contracts";
import { describe, expect, it } from "vitest";

import {
  buildGenerateResult,
  buildPlanResult,
  compactDiagnostics,
} from "../src/results.js";

const shaA = "a".repeat(64);
const shaB = "b".repeat(64);
const shaC = "c".repeat(64);
const runId = "run_test";
const runPath = `.uig/runs/${runId}`;

describe("compactDiagnostics", () => {
  it("preserves canonical order, strips evidence, and caps results at 50", () => {
    const diagnostics: Diagnostic[] = Array.from(
      { length: 52 },
      (_, index) => ({
        severity: index === 0 ? "warning" : "error",
        blocking: index > 0,
        stage: "resolve",
        code: `CODE_${String(index).padStart(2, "0")}`,
        message: `message ${index}`,
        source: {
          nodeId: `source:${index}`,
          manifestNodeId: `ui_${index}`,
        },
        evidence: { rawDsl: "must-not-leak" },
        suggestions: ["must-not-leak"],
      }),
    );

    const result = compactDiagnostics(
      diagnostics,
      `${runPath}/diagnostics.json`,
    );

    expect(result.totalCount).toBe(52);
    expect(result.returnedCount).toBe(50);
    expect(result.truncated).toBe(true);
    expect(result.items[0]?.code).toBe("CODE_00");
    expect(result.items[49]?.code).toBe("CODE_49");
    expect(JSON.stringify(result)).not.toContain("rawDsl");
    expect(JSON.stringify(result)).not.toContain("suggestions");
  });
});

describe("buildPlanResult", () => {
  it("projects a ready run without snapshot content or plan nodes", () => {
    const result = buildPlanResult({
      run: generationRun("completed-with-warnings"),
      runPath,
      snapshot: designSnapshot(),
      resolutionPlan: resolutionPlan(),
    });

    expect(result).toEqual({
      schema: "uig-qwen-plan-result/v1",
      status: "ready",
      runId,
      runPath,
      source: {
        fileKey: "WSLukjrKancvZG0zbaMnyA",
        nodeId: "4:314",
      },
      target: {
        designSystem: "sber-space-ui",
        designSystemVersion: "1.0.0",
        packSha256: shaA,
      },
      summary: {
        reuse: 1,
        compose: 1,
        fallback: 0,
        blocked: 0,
      },
      diagnostics: {
        items: [
          {
            code: "PLAN_WARNING",
            severity: "warning",
            blocking: false,
            stage: "resolve",
            manifestNodeId: "ui_dialog",
            sourceNodeId: "4:314",
            message: "Plan warning",
          },
        ],
        totalCount: 1,
        returnedCount: 1,
        truncated: false,
        artifactPath: `${runPath}/diagnostics.json`,
      },
    });
    expect(JSON.stringify(result)).not.toContain("pixso-node-dsl");
    expect(JSON.stringify(result)).not.toContain("@sber-space-ui/modal");
  });

  it("preserves a blocked plan status", () => {
    const run = generationRun("blocked");
    const plan = resolutionPlan();
    plan.summary = { reuse: 1, compose: 1, fallback: 0, blocked: 1 };
    plan.nodes.push({
      manifestNodeId: "ui_blocked",
      semanticRole: "unknown",
      confidence: 0,
      evidence: [],
      diagnosticCodes: ["UNRESOLVED"],
      decision: "blocked",
    });
    plan.diagnostics.push({
      code: "UNRESOLVED",
      severity: "error",
      blocking: true,
      stage: "resolve",
      message: "Resolution blocked",
    });

    expect(
      buildPlanResult({
        run,
        runPath,
        snapshot: designSnapshot(),
        resolutionPlan: plan,
      }).status,
    ).toBe("blocked");
  });
});

describe("buildGenerateResult", () => {
  it("projects files, verified imports, and render-only props", () => {
    const result = buildGenerateResult({
      runId,
      outputPath: `${runPath}/generated`,
      writeStatus: "written",
      report: generatedReport(),
      reportSha256: shaC,
      resolutionPlan: resolutionPlan(),
    });

    expect(result.files).toEqual([
      { path: "GeneratedModal.module.css", sha256: shaA },
      { path: "GeneratedModal.tsx", sha256: shaB },
      { path: "generation-report.json", sha256: shaC },
    ]);
    expect(result.imports).toEqual([
      {
        package: "@sber-space-ui/autocomplete",
        exports: ["Autocomplete"],
      },
      {
        package: "@sber-space-ui/modal",
        exports: ["Modal", "ModalBody", "ModalFooter"],
      },
    ]);
    expect(result.renderOnlyProps).toEqual([
      {
        manifestNodeId: "ui_combobox_4-316",
        targets: ["mode", "onChange", "options", "value"],
      },
    ]);
    expect(result.status).toBe("generated");
  });

  it("returns only the durable report for a blocked generation", () => {
    const generated = generatedReport();
    if (generated.schema !== "react-generation-report/v2") {
      throw new Error("Expected a v2 generation report fixture");
    }
    const { componentName: _componentName, ...common } = generated;
    const report: ReactGenerationReport = {
      ...common,
      status: "blocked",
      files: [],
      validation: {
        inputContracts: "passed",
        pack: "passed",
        syntax: "not-run",
        targetTypecheck: "not-run",
      },
      diagnostics: [
        {
          code: "GENERATION_BLOCKED",
          severity: "error",
          blocking: true,
          stage: "react-generation",
          message: "Generation blocked",
        },
      ],
    };

    const result = buildGenerateResult({
      runId,
      outputPath: `${runPath}/generated`,
      writeStatus: "written",
      report,
      reportSha256: shaC,
      resolutionPlan: resolutionPlan(),
    });

    expect(result.status).toBe("blocked");
    expect(result.files).toEqual([
      { path: "generation-report.json", sha256: shaC },
    ]);
  });
});

function generationRun(status: GenerationRun["status"]): GenerationRun {
  return {
    schema: "generation-run/v1",
    runId,
    status,
    stages: {
      fetch: "completed",
      normalize: "completed",
      summarize: "completed",
      plan: "completed",
      resolve: status === "blocked" ? "blocked" : "completed",
    },
    artifacts: {
      snapshot: "snapshot.json",
      designIr: "design-ir.json",
      designSummary: "design-summary.json",
      uiManifest: "ui-manifest.json",
      resolutionPlan: "resolution-plan.json",
      diagnostics: "diagnostics.json",
    },
  };
}

function designSnapshot(): DesignSnapshot {
  return {
    schema: "design-snapshot/v1",
    artifactId: "pixso_test",
    provider: "pixso",
    source: {
      documentId: "WSLukjrKancvZG0zbaMnyA",
      nodeId: "4:314",
      url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4%3A314",
    },
    retrievedAt: "2026-07-27T00:00:00.000Z",
    content: {
      format: "pixso-node-dsl",
      version: "2.1.15",
      sha256: shaB,
      byteLength: 83773,
    },
  };
}

function resolutionPlan(): ResolutionPlanV2 {
  return {
    schema: "resolution-plan/v2",
    source: {
      designIr: {
        artifactId: "design-ir.json",
        schema: "design-ir/v2",
        sha256: shaB,
      },
      uiManifest: {
        artifactId: "ui-manifest.json",
        schema: "ui-manifest/v2",
        sha256: shaC,
      },
    },
    target: {
      framework: "react",
      language: "typescript",
      designSystem: "sber-space-ui",
      designSystemVersion: "1.0.0",
      packSha256: shaA,
    },
    nodes: [
      {
        manifestNodeId: "ui_combobox",
        semanticRole: "combobox",
        confidence: 1,
        evidence: [],
        diagnosticCodes: [],
        decision: "reuse",
        binding: {
          componentId: "base.Autocomplete",
          package: "@sber-space-ui/autocomplete",
          export: "Autocomplete",
          exportKind: "named",
        },
        props: {},
      },
      {
        manifestNodeId: "ui_dialog",
        semanticRole: "dialog",
        confidence: 1,
        evidence: [],
        diagnosticCodes: [],
        decision: "compose",
        bindings: [
          {
            componentId: "base.Modal",
            package: "@sber-space-ui/modal",
            export: "Modal",
            exportKind: "named",
          },
          {
            componentId: "base.ModalFooter",
            package: "@sber-space-ui/modal",
            export: "ModalFooter",
            exportKind: "named",
          },
          {
            componentId: "base.ModalBody",
            package: "@sber-space-ui/modal",
            export: "ModalBody",
            exportKind: "named",
          },
        ],
        props: {},
      },
    ],
    diagnostics: [
      {
        code: "PLAN_WARNING",
        severity: "warning",
        blocking: false,
        stage: "resolve",
        source: {
          nodeId: "4:314",
          manifestNodeId: "ui_dialog",
        },
        message: "Plan warning",
        evidence: {
          rawDsl: "must-not-leak",
        },
      },
    ],
    summary: {
      reuse: 1,
      compose: 1,
      fallback: 0,
      blocked: 0,
    },
  };
}

function generatedReport(): ReactGenerationReport {
  return {
    schema: "react-generation-report/v2",
    status: "generated",
    sourceRunId: runId,
    designSystem: "sber-space-ui",
    componentName: "GeneratedModal",
    validation: {
      inputContracts: "passed",
      pack: "passed",
      syntax: "passed",
      targetTypecheck: "not-run",
    },
    files: [
      {
        path: "GeneratedModal.tsx",
        kind: "tsx",
        sha256: shaB,
        byteLength: 200,
      },
      {
        path: "GeneratedModal.module.css",
        kind: "css-module",
        sha256: shaA,
        byteLength: 100,
      },
    ],
    diagnostics: [],
    statistics: {
      manifestNodes: 2,
      imports: 4,
      generatedProps: 0,
      cssRules: 1,
      fallbackComponents: 0,
      filesByKind: {
        tsx: 1,
        cssModule: 1,
        fallbackTsx: 0,
        fallbackCssModule: 0,
      },
      sourceByteLength: 300,
    },
    renderOnlyProps: [
      {
        manifestNodeId: "ui_combobox_4-316",
        componentId: "base.Autocomplete",
        propNames: ["options", "mode", "value", "onChange"],
      },
    ],
  };
}
