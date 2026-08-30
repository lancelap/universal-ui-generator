import { createHash, randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { planFromSnapshot } from "@uig/cli/plan-from-snapshot";
import { planFromUrl } from "@uig/cli/plan-from-url";
import {
  EffectiveComponentCatalogV1Schema,
  GenerationRunSchema,
  ResolutionPlanV2Schema,
  UigPrepareBuildInputSchema,
  UigPrepareBuildResultSchema,
  UigRecordBrowserReviewInputSchema,
  UigRecordBrowserReviewResultSchema,
  UigRecordCodeReviewInputSchema,
  UigRecordCodeReviewResultSchema,
  UigRecordImplementationInputSchema,
  UigRecordImplementationResultSchema,
  validateWithSchema,
  type Diagnostic,
  type EffectiveComponentCatalogV1,
  type GenerationRun,
  type ResolutionPlanV2,
  type UigAgenticRunStatus,
  type UigPrepareBuildResult,
  type UigRecordBrowserReviewInput,
  type UigRecordBrowserReviewResult,
  type UigRecordCodeReviewInput,
  type UigRecordCodeReviewResult,
  type UigRecordImplementationInput,
  type UigRecordImplementationResult,
} from "@uig/contracts";
import {
  createArtifactStore,
  ensureContainedDirectoryTree,
} from "@uig/design-context";
import { PixsoProviderError, type PixsoDslClient } from "@uig/provider-pixso";
import { type ProjectContextService } from "@uig/project-context";

import { UigToolError } from "./tools.js";

const AGENTIC_DIR = "agentic";
const MAX_TREE_ENTRIES = 50;
const AGENTIC_REPORT_LIMIT = 50;

export interface AgenticToolDependencies {
  workspaceDir: string;
  extensionRoot: string;
  adapterModulePath: string;
  token: string | undefined;
  now: () => Date;
  createPixsoClient(token: string): PixsoDslClient;
  projectContextService: ProjectContextService;
}

export interface AgenticToolHandlers {
  prepareBuild(input: unknown): Promise<UigPrepareBuildResult>;
  recordImplementation(input: unknown): Promise<UigRecordImplementationResult>;
  recordCodeReview(input: unknown): Promise<UigRecordCodeReviewResult>;
  recordBrowserReview(input: unknown): Promise<UigRecordBrowserReviewResult>;
}

export function createAgenticTools(
  dependencies: AgenticToolDependencies,
): AgenticToolHandlers {
  return {
    async prepareBuild(input) {
      const parsed = validateWithSchema(UigPrepareBuildInputSchema, input);
      await assertSafeWorkspace(dependencies.workspaceDir);
      const source = parsed.source;

      let run: GenerationRun;
      let designSystem: string;
      let packSha256: string | undefined;
      let designSystemVersion: string | undefined;
      let planFromRun: ResolutionPlanV2 | undefined;

      switch (source.kind) {
        case "pixso-url": {
          const token = requireToken(dependencies.token);
          let client: PixsoDslClient;
          try {
            client = dependencies.createPixsoClient(token);
          } catch (error) {
            throw providerFailure(error);
          }
          const packPath = await resolvePackPath(
            dependencies.extensionRoot,
            source.designSystem,
          );
          try {
            run = await planFromUrl({
              url: source.url,
              designSystemPackPath: packPath,
              workspaceDir: dependencies.workspaceDir,
              pixsoClient: client,
              now: dependencies.now,
            });
          } catch (error) {
            if (error instanceof PixsoProviderError) {
              throw providerFailure(error);
            }
            throw new UigToolError(
              "UIG_PROVIDER_FAILED",
              `Pixso planning failed: ${(error as Error).message ?? "unknown"}`,
            );
          }
          designSystem = source.designSystem;
          break;
        }
        case "local-dsl": {
          await assertSafeWorkspaceFile(dependencies.workspaceDir, source.path);
          const packPath = await resolvePackPath(
            dependencies.extensionRoot,
            source.designSystem,
          );
          const artifactId = await storeLocalDsl(
            dependencies.workspaceDir,
            source.path,
          );
          run = await planFromSnapshot({
            artifactId,
            designSystemPackPath: packPath,
            workspaceDir: dependencies.workspaceDir,
            now: dependencies.now,
            fetchCompleted: true,
          });
          designSystem = source.designSystem;
          break;
        }
        case "stored-run": {
          const selected = await readSelectedRun(
            dependencies.workspaceDir,
            source.runId,
          );
          run = selected.run;
          planFromRun = await readResolutionPlan(selected.runDir);
          designSystem = planFromRun.target.designSystem;
          packSha256 = planFromRun.target.packSha256;
          designSystemVersion = planFromRun.target.designSystemVersion;
          break;
        }
        case "screenshot": {
          await assertSafeWorkspaceFile(dependencies.workspaceDir, source.path);
          const runId = buildRunId(dependencies.now());
          run = await writeScreenshotStumpRun({
            workspaceDir: dependencies.workspaceDir,
            now: dependencies.now(),
            runId,
            pageName: source.pageName,
            screenshotPath: source.path,
          });
          designSystem = source.designSystem;
          break;
        }
      }

      const plan =
        planFromRun ??
        (source.kind === "screenshot"
          ? null
          : await readResolutionPlanFromRun(
              dependencies.workspaceDir,
              run.runId,
            ));
      if (plan && !packSha256) {
        packSha256 = plan.target.packSha256;
        designSystemVersion = plan.target.designSystemVersion;
      }

      const diagnostics =
        source.kind === "screenshot" || !plan
          ? [
              {
                code: "UIG_SOURCE_KIND_SCREENSHOT",
                severity: "warning",
                blocking: false,
                stage: "normalize" as const,
                message:
                  "Screenshot source: design evidence is incomplete; the UI builder must rely on the user-supplied image",
              },
            ]
          : collectPrepareDiagnostics(run, plan);
      const blocking = diagnostics.some(
        (diagnostic) => diagnostic.severity === "error" && diagnostic.blocking,
      );
      const warning = diagnostics.some(
        (diagnostic) => diagnostic.severity === "warning",
      );

      const projectContext = await refreshProjectContext(
        dependencies.workspaceDir,
        dependencies.projectContextService,
        parsed.refreshProjectContext === true,
      );

      const reusable = projectContext
        ? buildReusableComponents(projectContext.catalog)
        : [];

      const result = validateWithSchema(UigPrepareBuildResultSchema, {
        schema: "uig-qwen-prepare-build-result/v1",
        status: blocking
          ? "blocked"
          : warning
            ? "ready-with-warnings"
            : "ready",
        runId: run.runId,
        runPath: `.uig/runs/${run.runId}`,
        sourceKind: source.kind,
        designEvidencePath: `.uig/runs/${run.runId}/design-evidence.json`,
        projectContextPath: projectContext
          ? projectContext.catalogPath
          : ".ui-context/missing",
        ...(projectContext?.fingerprint
          ? { projectContextFingerprint: projectContext.fingerprint }
          : {}),
        designSystem,
        ...(designSystemVersion ? { designSystemVersion } : {}),
        ...(packSha256 ? { packSha256 } : {}),
        reusableComponents: reusable,
        diagnostics,
      });

      await writePrepareBuildArtifact({
        workspaceDir: dependencies.workspaceDir,
        runId: run.runId,
        result,
        projectContext,
      });

      if (blocking) {
        throw new UigToolError(
          "UIG_RUN_INVALID",
          "Prepare build returned a blocked run; see diagnostics",
        );
      }
      return result;
    },

    async recordImplementation(input) {
      const parsed = validateWithSchema(
        UigRecordImplementationInputSchema,
        input,
      );
      await assertSafeWorkspace(dependencies.workspaceDir);
      const selected = await readSelectedRun(
        dependencies.workspaceDir,
        parsed.runId,
      );
      const artifactPath = await writeImplementationReport(
        dependencies.workspaceDir,
        selected.run.runId,
        parsed,
      );
      const accepted = await assertImplementationScope(
        dependencies.workspaceDir,
        parsed,
      );
      const status = rollupStatusAfterImplementation(parsed, accepted);
      await writeAgenticStatus(dependencies.workspaceDir, selected.run.runId, {
        status,
        reportPath: relative(dependencies.workspaceDir, artifactPath),
        updatedAt: dependencies.now().toISOString(),
      });
      return validateWithSchema(UigRecordImplementationResultSchema, {
        schema: "uig-qwen-record-implementation-result/v1",
        runId: selected.run.runId,
        runStatus: status,
        reportPath: relative(dependencies.workspaceDir, artifactPath),
        reportSha256: await sha256File(artifactPath),
        importedComponents: parsed.importedComponents,
        accepted,
        ...(accepted
          ? {}
          : {
              rejection: {
                code: "UIG_IMPLEMENTATION_OUT_OF_SCOPE",
                message:
                  "Implementation touched files outside the recorded write scope",
              },
            }),
      });
    },

    async recordCodeReview(input) {
      const parsed = validateWithSchema(UigRecordCodeReviewInputSchema, input);
      await assertSafeWorkspace(dependencies.workspaceDir);
      const selected = await readSelectedRun(
        dependencies.workspaceDir,
        parsed.runId,
      );
      const artifactPath = await writeCodeReviewReport(
        dependencies.workspaceDir,
        selected.run.runId,
        parsed,
      );
      const previous = await readAgenticStatus(
        dependencies.workspaceDir,
        selected.run.runId,
      );
      const status = rollupStatusAfterCodeReview(parsed, previous);
      await writeAgenticStatus(dependencies.workspaceDir, selected.run.runId, {
        status,
        reportPath: relative(dependencies.workspaceDir, artifactPath),
        updatedAt: dependencies.now().toISOString(),
      });
      return validateWithSchema(UigRecordCodeReviewResultSchema, {
        schema: "uig-qwen-record-code-review-result/v1",
        runId: selected.run.runId,
        runStatus: status,
        reportPath: relative(dependencies.workspaceDir, artifactPath),
        reportSha256: await sha256File(artifactPath),
        accepted: true,
      });
    },

    async recordBrowserReview(input) {
      const parsed = validateWithSchema(
        UigRecordBrowserReviewInputSchema,
        input,
      );
      await assertSafeWorkspace(dependencies.workspaceDir);
      const selected = await readSelectedRun(
        dependencies.workspaceDir,
        parsed.runId,
      );
      const artifactPath = await writeBrowserReviewReport(
        dependencies.workspaceDir,
        selected.run.runId,
        parsed,
      );
      const previous = await readAgenticStatus(
        dependencies.workspaceDir,
        selected.run.runId,
      );
      const status = rollupStatusAfterBrowserReview(parsed, previous);
      await writeAgenticStatus(dependencies.workspaceDir, selected.run.runId, {
        status,
        reportPath: relative(dependencies.workspaceDir, artifactPath),
        updatedAt: dependencies.now().toISOString(),
      });
      return validateWithSchema(UigRecordBrowserReviewResultSchema, {
        schema: "uig-qwen-record-browser-review-result/v1",
        runId: selected.run.runId,
        runStatus: status,
        reportPath: relative(dependencies.workspaceDir, artifactPath),
        reportSha256: await sha256File(artifactPath),
        accepted: true,
      });
    },
  };
}

export interface ProjectContextSnapshot {
  catalogPath: string;
  fingerprint: string;
  catalog: EffectiveComponentCatalogV1;
}

async function refreshProjectContext(
  workspaceDir: string,
  service: ProjectContextService,
  refresh: boolean,
): Promise<ProjectContextSnapshot | null> {
  if (refresh) {
    const scan = await service.scan({});
    if (scan.status === "completed") {
      const catalog = await readCatalogFromWorkspace(
        workspaceDir,
        scan.catalog.path,
      );
      return {
        catalogPath: scan.catalog.path,
        fingerprint: scan.catalog.fingerprint,
        catalog,
      };
    }
    return null;
  }
  const status = await service.status();
  if (status.status !== "ready" || !status.catalog) {
    return null;
  }
  const catalog = await readCatalogFromWorkspace(
    workspaceDir,
    status.catalog.path,
  );
  return {
    catalogPath: status.catalog.path,
    fingerprint: status.catalog.fingerprint,
    catalog,
  };
}

async function readCatalogFromWorkspace(
  workspaceDir: string,
  relativePath: string,
): Promise<EffectiveComponentCatalogV1> {
  const absolute = resolve(workspaceDir, relativePath);
  const text = await readFile(absolute, "utf8");
  const value = JSON.parse(text);
  return validateWithSchema(EffectiveComponentCatalogV1Schema, value);
}

function buildReusableComponents(catalog: EffectiveComponentCatalogV1) {
  return catalog.components.slice(0, MAX_TREE_ENTRIES).map((component) => {
    const status = pickComponentStatus(component);
    return {
      componentId: component.id,
      exportName: component.import.export,
      importSource: component.import.source,
      status,
      semanticRoles: component.semantics
        .map((entry) => entry.role)
        .slice(0, 50),
    };
  });
}

function pickComponentStatus(
  component: EffectiveComponentCatalogV1["components"][number],
): "verified" | "mapped" | "pack-owned" | "suggested" {
  if (component.semantics.some((entry) => entry.status === "pack-owned")) {
    return "pack-owned";
  }
  if (component.semantics.some((entry) => entry.status === "mapped")) {
    return "mapped";
  }
  if (component.semantics.length > 0) {
    return "suggested";
  }
  return "verified";
}

function collectPrepareDiagnostics(
  run: GenerationRun,
  plan: ResolutionPlanV2,
): UigPrepareBuildResult["diagnostics"] {
  const out: UigPrepareBuildResult["diagnostics"] = [];
  const stages: Record<
    keyof GenerationRun["stages"],
    GenerationRun["stages"][keyof GenerationRun["stages"]]
  > = run.stages;
  for (const key of Object.keys(stages) as Array<
    keyof GenerationRun["stages"]
  >) {
    const value = stages[key];
    if (value === "blocked") {
      out.push({
        code: `STAGE_${String(key).toUpperCase()}_BLOCKED`,
        severity: "error",
        blocking: true,
        stage: stageForKey(key),
        message: `Stage ${String(key)} is blocked`,
      });
    }
  }
  for (const diagnostic of plan.diagnostics) {
    if (out.length >= AGENTIC_REPORT_LIMIT) break;
    if (diagnostic.severity === "info") continue;
    out.push({
      code: diagnostic.code,
      severity: diagnostic.severity === "error" ? "error" : "warning",
      blocking: diagnostic.blocking,
      stage: "resolve",
      message: diagnostic.message,
    });
  }
  return out;
}

function stageForKey(
  key: keyof GenerationRun["stages"],
):
  | "fetch"
  | "normalize"
  | "summarize"
  | "plan"
  | "resolve"
  | "context"
  | "store" {
  switch (key) {
    case "fetch":
      return "fetch";
    case "normalize":
      return "normalize";
    case "summarize":
      return "summarize";
    case "plan":
      return "plan";
    case "resolve":
      return "resolve";
  }
}

async function writePrepareBuildArtifact(input: {
  workspaceDir: string;
  runId: string;
  result: UigPrepareBuildResult;
  projectContext: ProjectContextSnapshot | null;
}): Promise<void> {
  const runDir = join(input.workspaceDir, ".uig", "runs", input.runId);
  const dir = join(runDir, AGENTIC_DIR);
  await mkdir(dir, { recursive: true });
  const file = join(dir, "build-prep.json");
  const snapshot = {
    schema: "uig-qwen-build-prep/v1",
    capturedAt: new Date().toISOString(),
    result: input.result,
    projectContext: input.projectContext
      ? {
          catalogPath: input.projectContext.catalogPath,
          fingerprint: input.projectContext.fingerprint,
          summary: input.projectContext.catalog.summary,
        }
      : null,
  };
  await writeFile(file, JSON.stringify(snapshot, null, 2), "utf8");
  const evidenceFile = join(runDir, "design-evidence.json");
  await writeFile(
    evidenceFile,
    JSON.stringify(
      {
        schema: "uig-qwen-design-evidence/v1",
        capturedAt: new Date().toISOString(),
        result: input.result,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function writeImplementationReport(
  workspaceDir: string,
  runId: string,
  payload: UigRecordImplementationInput,
): Promise<string> {
  const file = await joinAgentic(workspaceDir, runId, "implementation.json");
  await writeFile(
    file,
    JSON.stringify(
      {
        schema: "uig-qwen-implementation-report/v1",
        capturedAt: new Date().toISOString(),
        payload,
      },
      null,
      2,
    ),
    "utf8",
  );
  return file;
}

async function writeCodeReviewReport(
  workspaceDir: string,
  runId: string,
  payload: UigRecordCodeReviewInput,
): Promise<string> {
  const file = await joinAgentic(workspaceDir, runId, "code-review.json");
  await writeFile(
    file,
    JSON.stringify(
      {
        schema: "uig-qwen-code-review-report/v1",
        capturedAt: new Date().toISOString(),
        payload,
      },
      null,
      2,
    ),
    "utf8",
  );
  return file;
}

async function writeBrowserReviewReport(
  workspaceDir: string,
  runId: string,
  payload: UigRecordBrowserReviewInput,
): Promise<string> {
  const file = await joinAgentic(workspaceDir, runId, "browser-review.json");
  await writeFile(
    file,
    JSON.stringify(
      {
        schema: "uig-qwen-browser-review-report/v1",
        capturedAt: new Date().toISOString(),
        payload,
      },
      null,
      2,
    ),
    "utf8",
  );
  return file;
}

async function joinAgentic(
  workspaceDir: string,
  runId: string,
  name: string,
): Promise<string> {
  const dir = join(workspaceDir, ".uig", "runs", runId, AGENTIC_DIR);
  await mkdir(dir, { recursive: true });
  return join(dir, name);
}

async function writeAgenticStatus(
  workspaceDir: string,
  runId: string,
  status: {
    status: UigAgenticRunStatus;
    reportPath: string;
    updatedAt: string;
  },
): Promise<void> {
  const file = await joinAgentic(workspaceDir, runId, "status.json");
  await writeFile(file, JSON.stringify(status, null, 2), "utf8");
}

async function readAgenticStatus(
  workspaceDir: string,
  runId: string,
): Promise<{
  status: UigAgenticRunStatus;
  reportPath: string;
  updatedAt: string;
} | null> {
  const file = join(
    workspaceDir,
    ".uig",
    "runs",
    runId,
    AGENTIC_DIR,
    "status.json",
  );
  try {
    const bytes = await readFile(file, "utf8");
    return JSON.parse(bytes);
  } catch {
    return null;
  }
}

function rollupStatusAfterImplementation(
  payload: UigRecordImplementationInput,
  accepted: boolean,
): UigAgenticRunStatus {
  if (!accepted) {
    return "blocked";
  }
  if (payload.status === "failed") {
    return "generated-with-errors";
  }
  if (payload.status === "partial") {
    return "partial-success";
  }
  return "implementation-recorded";
}

function rollupStatusAfterCodeReview(
  payload: UigRecordCodeReviewInput,
  previous: { status: UigAgenticRunStatus } | null,
): UigAgenticRunStatus {
  if (payload.verdict === "changes-requested") {
    return "generated-with-errors";
  }
  if (
    previous?.status === "implementation-recorded" ||
    previous?.status === "code-review-recorded"
  ) {
    return "code-review-recorded";
  }
  return "code-review-recorded";
}

function rollupStatusAfterBrowserReview(
  payload: UigRecordBrowserReviewInput,
  previous: { status: UigAgenticRunStatus } | null,
): UigAgenticRunStatus {
  const cameFromImplementation =
    previous?.status === "code-review-recorded" ||
    previous?.status === "implementation-recorded";
  if (payload.verdict === "ok") {
    return cameFromImplementation ? "complete" : "complete";
  }
  if (payload.verdict === "ok-with-warnings") {
    return cameFromImplementation ? "partial-success" : "partial-success";
  }
  return "generated-with-errors";
}

async function assertImplementationScope(
  workspaceDir: string,
  payload: UigRecordImplementationInput,
): Promise<boolean> {
  const workspaceRoot = resolve(workspaceDir);
  for (const file of [...payload.createdFiles, ...payload.modifiedFiles]) {
    if (
      file.path.startsWith(".uig/") ||
      file.path.startsWith(".ui-context/") ||
      file.path.includes("..")
    ) {
      return false;
    }
    const absolute = resolve(workspaceRoot, file.path);
    if (
      !absolute.startsWith(`${workspaceRoot}${sep}`) &&
      absolute !== workspaceRoot
    ) {
      return false;
    }
    try {
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) {
        const target = await readlink(absolute);
        if (target.includes("..")) {
          return false;
        }
      }
    } catch {
      // file may not exist yet — accepted; scope check is on path only
    }
  }
  return true;
}

async function writeScreenshotStumpRun(input: {
  workspaceDir: string;
  now: Date;
  runId: string;
  pageName: string;
  screenshotPath: string;
}): Promise<GenerationRun> {
  const runDir = join(input.workspaceDir, ".uig", "runs", input.runId);
  await mkdir(runDir, { recursive: true });
  const nodeId = input.pageName.replace(/[^A-Za-z0-9_-]+/g, "-");
  const run: GenerationRun = {
    schema: "generation-run/v1",
    runId: input.runId,
    status: "completed-with-warnings",
    stages: {
      fetch: "completed",
      normalize: "skipped",
      summarize: "skipped",
      plan: "skipped",
      resolve: "skipped",
    },
    artifacts: {
      snapshot: "screenshot.json",
      designIr: "screenshot.design-ir.json",
      designSummary: "screenshot.design-summary.json",
      uiManifest: "screenshot.ui-manifest.json",
      resolutionPlan: "screenshot.resolution-plan.json",
      diagnostics: "diagnostics.json",
    },
  };
  await writeFile(
    join(runDir, "run.json"),
    JSON.stringify(run, null, 2),
    "utf8",
  );
  const screenshotBytes = await readFile(
    join(input.workspaceDir, input.screenshotPath),
  );
  await writeFile(
    join(runDir, "screenshot.json"),
    JSON.stringify(
      {
        schema: "design-screenshot/v1",
        runId: input.runId,
        pageName: input.pageName,
        nodeId,
        path: input.screenshotPath,
        sha256: createHash("sha256").update(screenshotBytes).digest("hex"),
        byteLength: screenshotBytes.byteLength,
      },
      null,
      2,
    ),
    "utf8",
  );
  const diagnostics: Diagnostic[] = [
    {
      severity: "warning",
      blocking: false,
      stage: "normalize",
      code: "UIG_SOURCE_KIND_SCREENSHOT",
      message:
        "Screenshot source: design evidence is incomplete; the UI builder must rely on the user-supplied image",
    },
  ];
  await writeFile(
    join(runDir, "diagnostics.json"),
    JSON.stringify(diagnostics, null, 2),
    "utf8",
  );
  return run;
}

async function storeLocalDsl(
  workspaceDir: string,
  relativePath: string,
): Promise<string> {
  const absolute = resolve(workspaceDir, relativePath);
  const bytes = await readFile(absolute);
  const parsed = JSON.parse(
    new TextDecoder("utf8", { fatal: true }).decode(bytes),
  );
  const dslRoot = parsed?.dsl;
  const firstNode = Array.isArray(dslRoot?.pixTreeDslNodes)
    ? dslRoot.pixTreeDslNodes[0]
    : undefined;
  const fallbackIdPart = createHash("sha256")
    .update(bytes)
    .digest("hex")
    .slice(0, 12);
  const documentId =
    typeof dslRoot?.fileKey === "string" && dslRoot.fileKey.length > 0
      ? dslRoot.fileKey
      : typeof firstNode?.fileKey === "string" && firstNode.fileKey.length > 0
        ? firstNode.fileKey
        : `_local_${fallbackIdPart}`;
  const nodeId =
    typeof dslRoot?.nodeId === "string" && dslRoot.nodeId.length > 0
      ? dslRoot.nodeId
      : typeof firstNode?.guid === "string" && firstNode.guid.length > 0
        ? firstNode.guid
        : (() => {
            const exported = Array.isArray(dslRoot?.exportedRootNodeIds)
              ? dslRoot.exportedRootNodeIds
              : Array.isArray(dslRoot?.exportedRootNodeId)
                ? [dslRoot.exportedRootNodeId]
                : [];
            return exported[0] ?? "local";
          })();
  const store = createArtifactStore(join(workspaceDir, ".uig"));
  const stored = await store.put({
    provider: "pixso",
    documentId,
    nodeId,
    bytes,
  });
  return stored.artifactId;
}

async function readSelectedRun(
  workspaceDir: string,
  runId: string,
): Promise<{ runDir: string; run: GenerationRun }> {
  const canonical = await realpath(workspaceDir);
  const runsRoot = await realpath(join(workspaceDir, ".uig", "runs"));
  if (!runsRoot.startsWith(`${canonical}${sep}`)) {
    throw new UigToolError(
      "UIG_FILESYSTEM_FAILED",
      "Runs root escapes workspace",
    );
  }
  const selected = join(workspaceDir, ".uig", "runs", runId);
  const stat = await lstat(selected);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new UigToolError(
      "UIG_RUN_INVALID",
      "Run path is not an ordinary directory",
    );
  }
  const runDir = await realpath(selected);
  if (!runDir.startsWith(`${runsRoot}${sep}`)) {
    throw new UigToolError(
      "UIG_FILESYSTEM_FAILED",
      "Run directory escapes runs root",
    );
  }
  const run = validateWithSchema(
    GenerationRunSchema,
    JSON.parse(await readFile(join(runDir, "run.json"), "utf8")),
  );
  if (run.runId !== runId) {
    throw new UigToolError("UIG_RUN_INVALID", "Run ID mismatch");
  }
  return { runDir, run };
}

async function readResolutionPlanFromRun(
  workspaceDir: string,
  runId: string,
): Promise<ResolutionPlanV2> {
  const selected = await readSelectedRun(workspaceDir, runId);
  return readResolutionPlan(selected.runDir);
}

async function readResolutionPlan(runDir: string): Promise<ResolutionPlanV2> {
  const entries = await readdir(runDir);
  const file = entries.find(
    (entry) => entry.startsWith("resolution-plan.") && entry.endsWith(".json"),
  );
  if (!file) {
    throw new UigToolError(
      "UIG_RUN_INVALID",
      "Resolution plan artifact missing",
    );
  }
  const value = JSON.parse(await readFile(join(runDir, file), "utf8"));
  return validateWithSchema(ResolutionPlanV2Schema, value);
}

async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertSafeWorkspaceFile(
  workspaceDir: string,
  relativePath: string,
): Promise<void> {
  if (relativePath.includes("..") || relativePath.startsWith("/")) {
    throw new UigToolError(
      "UIG_INPUT_INVALID",
      "Source path escapes the workspace",
    );
  }
  const absolute = resolve(workspaceDir, relativePath);
  if (
    !absolute.startsWith(`${resolve(workspaceDir)}${sep}`) &&
    absolute !== resolve(workspaceDir)
  ) {
    throw new UigToolError(
      "UIG_INPUT_INVALID",
      "Source path escapes the workspace",
    );
  }
  try {
    await access(absolute);
  } catch {
    throw new UigToolError(
      "UIG_INPUT_INVALID",
      `Source path is unreadable: ${relativePath}`,
    );
  }
}

async function assertSafeWorkspace(workspaceDir: string): Promise<void> {
  try {
    await ensureContainedDirectoryTree(workspaceDir, [
      ".uig",
      join(".uig", "agentic"),
      join(".uig", "cache"),
      join(".uig", "cache", "sha256"),
      join(".uig", "artifacts"),
      join(".uig", "runs"),
    ]);
  } catch {
    throw new UigToolError(
      "UIG_FILESYSTEM_FAILED",
      "Workspace storage path is unsafe",
    );
  }
}

function requireToken(token: string | undefined): string {
  if (!token || token.trim().length === 0) {
    throw new UigToolError(
      "UIG_PROVIDER_CONFIG_MISSING",
      "Pixso access token is not configured",
    );
  }
  return token;
}

function buildRunId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  return `run_${timestamp}_${randomUUID().slice(0, 8)}`;
}

async function resolvePackPath(
  extensionRoot: string,
  designSystem: string,
): Promise<string> {
  const packsRoot = resolve(extensionRoot, "design-system-packs");
  const candidate = resolve(packsRoot, designSystem);
  if (candidate === packsRoot || !candidate.startsWith(`${packsRoot}${sep}`)) {
    throw new UigToolError("UIG_INPUT_INVALID", "Unsafe design-system ID");
  }
  try {
    const canonicalExtensionRoot = await realpath(extensionRoot);
    const canonicalPacksRoot = await realpath(packsRoot);
    if (
      canonicalPacksRoot !== canonicalExtensionRoot &&
      !canonicalPacksRoot.startsWith(`${canonicalExtensionRoot}${sep}`)
    ) {
      throw new Error("Pack root escapes the extension");
    }
    const metadata = await lstat(candidate);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Pack is not an ordinary directory");
    }
    const canonicalCandidate = await realpath(candidate);
    if (!canonicalCandidate.startsWith(`${canonicalPacksRoot}${sep}`)) {
      throw new Error("Pack resolves outside the pack root");
    }
    return canonicalCandidate;
  } catch {
    throw new UigToolError(
      "UIG_PACK_INVALID",
      `Design-system pack ${JSON.stringify(designSystem)} is unavailable`,
    );
  }
}

function providerFailure(error: unknown): UigToolError {
  const providerCode =
    error instanceof PixsoProviderError ? error.code : "PIXSO_REQUEST_FAILED";
  return new UigToolError(
    "UIG_PROVIDER_FAILED",
    `Pixso planning failed with ${providerCode}`,
  );
}
