import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  DesignSnapshot,
  GenerationRun,
  ReactGenerationReportV2,
  ResolutionPlanV2,
} from "@uig/contracts";
import { stableStringify } from "@uig/contracts";
import { type PixsoDslClient, PixsoProviderError } from "@uig/provider-pixso";
import { afterEach, describe, expect, it } from "vitest";

import { createUigTools, UigToolError } from "../src/tools.js";

const extensionRoot = fileURLToPath(new URL("../../../", import.meta.url));
const adapterModulePath = join(extensionRoot, "dist", "qwen-adapter.mjs");
const sentinelToken = "sentinel-pixso-token";
const shaA = "a".repeat(64);
const shaB = "b".repeat(64);
const shaC = "c".repeat(64);
const runId = "run_test";

describe("createUigTools", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("anchors planning to the MCP workspace and extension pack", async () => {
    const workspaceDir = await temporaryWorkspace(roots);
    let captured:
      | {
          url: string;
          designSystemPackPath: string;
          workspaceDir: string;
          pixsoClient: PixsoDslClient;
        }
      | undefined;
    const pixsoClient = fixturePixsoClient();
    const tools = createUigTools(
      dependencies(workspaceDir, {
        createPixsoClient: () => pixsoClient,
        planFromUrl: async (input) => {
          captured = input;
          const fixture = planFixture();
          await writePlanArtifacts(workspaceDir, fixture);
          return fixture.run;
        },
      }),
    );

    const result = await tools.plan({
      url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314",
      designSystem: "sber-space-ui",
    });

    expect(captured).toMatchObject({
      url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314",
      workspaceDir,
      designSystemPackPath: join(
        extensionRoot,
        "design-system-packs",
        "sber-space-ui",
      ),
      pixsoClient,
    });
    expect(result).toMatchObject({
      schema: "uig-qwen-plan-result/v1",
      status: "ready",
      runId,
      runPath: `.uig/runs/${runId}`,
      source: {
        fileKey: "WSLukjrKancvZG0zbaMnyA",
        nodeId: "4:314",
      },
    });
    expect(JSON.stringify(result)).not.toContain("rawDsl");
    expect(JSON.stringify(result)).not.toContain(sentinelToken);
  });

  it("uses the recorded pack and self-fork entrypoint for generation", async () => {
    const workspaceDir = await temporaryWorkspace(roots);
    const fixture = planFixture();
    await writePlanArtifacts(workspaceDir, fixture);
    let captured:
      | {
          runId: string;
          workspaceDir: string;
          explicitPackPath?: string;
          workerEntrypoint?: {
            modulePath: string;
            args: string[];
            execArgv: string[];
          };
        }
      | undefined;
    const report = generatedReport();
    const tools = createUigTools(
      dependencies(workspaceDir, {
        generateFromRun: async (input) => {
          captured = input;
          await writeGenerationReport(workspaceDir, report);
          return {
            outputPath: `.uig/runs/${runId}/generated`,
            status: "generated",
            writeStatus: "written",
          };
        },
      }),
    );

    const result = await tools.generate({ runId });

    expect(captured).toEqual({
      runId,
      workspaceDir,
      explicitPackPath: join(
        extensionRoot,
        "design-system-packs",
        "sber-space-ui",
      ),
      workerEntrypoint: {
        modulePath: adapterModulePath,
        args: ["--generation-worker"],
        execArgv: [],
      },
    });
    expect(result).toMatchObject({
      schema: "uig-qwen-generate-result/v1",
      status: "generated",
      runId,
      outputPath: `.uig/runs/${runId}/generated`,
    });
    expect(result.files.at(-1)).toEqual({
      path: "generation-report.json",
      sha256: createHash("sha256")
        .update(stableStringify(report))
        .digest("hex"),
    });
  });

  it.each(["../sber-space-ui", "/tmp/pack", "sber_space_ui"])(
    "rejects unsafe design-system input %j before planning",
    async (designSystem) => {
      const workspaceDir = await temporaryWorkspace(roots);
      let called = false;
      const tools = createUigTools(
        dependencies(workspaceDir, {
          planFromUrl: async () => {
            called = true;
            throw new Error("must not run");
          },
        }),
      );

      await expect(
        tools.plan({
          url: "https://pixso.net/app/design/file?item-id=4:314",
          designSystem,
        }),
      ).rejects.toMatchObject({
        code: "UIG_INPUT_INVALID",
      });
      expect(called).toBe(false);
    },
  );

  it("rejects an absent safe pack before planning", async () => {
    const workspaceDir = await temporaryWorkspace(roots);
    let called = false;
    const tools = createUigTools(
      dependencies(workspaceDir, {
        planFromUrl: async () => {
          called = true;
          throw new Error("must not run");
        },
      }),
    );

    await expect(
      tools.plan({
        url: "https://pixso.net/app/design/file?item-id=4:314",
        designSystem: "absent-pack",
      }),
    ).rejects.toMatchObject({
      code: "UIG_PACK_INVALID",
    });
    expect(called).toBe(false);
  });

  it("rejects a missing token before creating run artifacts", async () => {
    const workspaceDir = await temporaryWorkspace(roots);
    let called = false;
    const tools = createUigTools({
      ...dependencies(workspaceDir, {
        planFromUrl: async () => {
          called = true;
          throw new Error("must not run");
        },
      }),
      token: "   ",
    });

    await expect(
      tools.plan({
        url: "https://pixso.net/app/design/file?item-id=4:314",
        designSystem: "sber-space-ui",
      }),
    ).rejects.toMatchObject({
      code: "UIG_PROVIDER_CONFIG_MISSING",
    });
    expect(called).toBe(false);
    await expect(readFile(join(workspaceDir, ".uig"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("preserves blocked plan and generation statuses", async () => {
    const workspaceDir = await temporaryWorkspace(roots);
    const fixture = planFixture("blocked");
    const report = blockedReport();
    const tools = createUigTools(
      dependencies(workspaceDir, {
        planFromUrl: async () => {
          await writePlanArtifacts(workspaceDir, fixture);
          return fixture.run;
        },
        generateFromRun: async () => {
          await writeGenerationReport(workspaceDir, report);
          return {
            outputPath: `.uig/runs/${runId}/generated`,
            status: "blocked",
            writeStatus: "written",
          };
        },
      }),
    );

    await expect(
      tools.plan({
        url: "https://pixso.net/app/design/file?item-id=4:314",
        designSystem: "sber-space-ui",
      }),
    ).resolves.toMatchObject({ status: "blocked" });
    const generated = await tools.generate({ runId });
    expect(generated.status).toBe("blocked");
    expect(generated.files).toHaveLength(1);
    expect(generated.files[0]?.path).toBe("generation-report.json");
  });

  it("rejects unsafe run IDs before generation", async () => {
    const workspaceDir = await temporaryWorkspace(roots);
    let called = false;
    const tools = createUigTools(
      dependencies(workspaceDir, {
        generateFromRun: async () => {
          called = true;
          throw new Error("must not run");
        },
      }),
    );

    await expect(
      tools.generate({ runId: "../run_test" }),
    ).rejects.toMatchObject({
      code: "UIG_INPUT_INVALID",
    });
    expect(called).toBe(false);
  });

  it("redacts provider error details and the token", async () => {
    const workspaceDir = await temporaryWorkspace(roots);
    const tools = createUigTools(
      dependencies(workspaceDir, {
        planFromUrl: async () => {
          throw new PixsoProviderError(
            "PIXSO_AUTH_FAILED",
            `Rejected ${sentinelToken}`,
          );
        },
      }),
    );

    const error = await tools
      .plan({
        url: "https://pixso.net/app/design/file?item-id=4:314",
        designSystem: "sber-space-ui",
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UigToolError);
    expect(error).toMatchObject({
      code: "UIG_PROVIDER_FAILED",
    });
    expect(JSON.stringify(error)).not.toContain(sentinelToken);
    expect((error as Error).message).not.toContain(sentinelToken);
    expect((error as Error).message).not.toContain("at ");
  });
});

function dependencies(
  workspaceDir: string,
  overrides: Partial<Parameters<typeof createUigTools>[0]> = {},
): Parameters<typeof createUigTools>[0] {
  return {
    workspaceDir,
    extensionRoot,
    adapterModulePath,
    token: sentinelToken,
    now: () => new Date("2026-07-27T00:00:00.000Z"),
    createPixsoClient: () => fixturePixsoClient(),
    planFromUrl: async () => {
      throw new Error("Unexpected planFromUrl call");
    },
    generateFromRun: async () => {
      throw new Error("Unexpected generateFromRun call");
    },
    ...overrides,
  };
}

async function temporaryWorkspace(roots: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "uig-qwen-tools-"));
  roots.push(root);
  return root;
}

function fixturePixsoClient(): PixsoDslClient {
  return {
    async getNodeDsl() {
      return new TextEncoder().encode('{"dsl":{"dslVersion":"2.1.15"}}');
    },
  };
}

function planFixture(status: GenerationRun["status"] = "completed"): {
  run: GenerationRun;
  snapshot: DesignSnapshot;
  resolutionPlan: ResolutionPlanV2;
} {
  const run: GenerationRun = {
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
      resolutionPlan: "resolution-plan.sber-space-ui.json",
      diagnostics: "diagnostics.json",
    },
  };
  const resolutionPlan: ResolutionPlanV2 = {
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
        manifestNodeId: "ui_dialog",
        semanticRole: "dialog",
        confidence: 1,
        evidence: [],
        diagnosticCodes: [],
        decision: "reuse",
        binding: {
          componentId: "base.Modal",
          package: "@sber-space-ui/modal",
          export: "Modal",
          exportKind: "named",
        },
        props: {},
      },
    ],
    diagnostics:
      status === "blocked"
        ? [
            {
              code: "UNRESOLVED",
              severity: "error",
              blocking: true,
              stage: "resolve",
              message: "Resolution blocked",
            },
          ]
        : [],
    summary: {
      reuse: 1,
      compose: 0,
      fallback: 0,
      blocked: status === "blocked" ? 1 : 0,
    },
  };
  if (status === "blocked") {
    resolutionPlan.nodes.push({
      manifestNodeId: "ui_blocked",
      semanticRole: "unknown",
      confidence: 0,
      evidence: [],
      diagnosticCodes: ["UNRESOLVED"],
      decision: "blocked",
    });
  }
  return {
    run,
    snapshot: {
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
        byteLength: 100,
      },
    },
    resolutionPlan,
  };
}

async function writePlanArtifacts(
  workspaceDir: string,
  fixture: ReturnType<typeof planFixture>,
): Promise<void> {
  const runDir = join(workspaceDir, ".uig", "runs", runId);
  await mkdir(runDir, { recursive: true });
  await Promise.all([
    writeFile(join(runDir, "run.json"), stableStringify(fixture.run)),
    writeFile(
      join(runDir, fixture.run.artifacts.snapshot),
      stableStringify(fixture.snapshot),
    ),
    writeFile(
      join(runDir, fixture.run.artifacts.resolutionPlan),
      stableStringify(fixture.resolutionPlan),
    ),
    writeFile(
      join(runDir, fixture.run.artifacts.diagnostics),
      stableStringify(fixture.resolutionPlan.diagnostics),
    ),
  ]);
}

async function writeGenerationReport(
  workspaceDir: string,
  report: ReactGenerationReportV2,
): Promise<void> {
  const output = join(workspaceDir, ".uig", "runs", runId, "generated");
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, "generation-report.json"),
    stableStringify(report),
  );
}

function generatedReport(): ReactGenerationReportV2 {
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
    ],
    diagnostics: [],
    statistics: {
      manifestNodes: 1,
      imports: 1,
      generatedProps: 0,
      cssRules: 0,
      fallbackComponents: 0,
      filesByKind: {
        tsx: 1,
        cssModule: 0,
        fallbackTsx: 0,
        fallbackCssModule: 0,
      },
      sourceByteLength: 200,
    },
    renderOnlyProps: [],
  };
}

function blockedReport(): ReactGenerationReportV2 {
  return {
    schema: "react-generation-report/v2",
    status: "blocked",
    sourceRunId: runId,
    designSystem: "sber-space-ui",
    validation: {
      inputContracts: "passed",
      pack: "passed",
      syntax: "not-run",
      targetTypecheck: "not-run",
    },
    files: [],
    diagnostics: [
      {
        code: "GENERATION_BLOCKED",
        severity: "error",
        blocking: true,
        stage: "react-generation",
        message: "Generation blocked",
      },
    ],
    statistics: {
      manifestNodes: 2,
      imports: 1,
      generatedProps: 0,
      cssRules: 0,
      fallbackComponents: 0,
      filesByKind: {
        tsx: 0,
        cssModule: 0,
        fallbackTsx: 0,
        fallbackCssModule: 0,
      },
      sourceByteLength: 0,
    },
    renderOnlyProps: [],
  };
}
