import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import {
  type GenerationWorkerEntrypoint,
  generateFromRun,
} from "@uig/cli/generate-from-run";
import { planFromUrl } from "@uig/cli/plan-from-url";
import {
  assertReactGenerationReportIntegrity,
  DesignSnapshotSchema,
  type GenerationRun,
  GenerationRunSchema,
  ReactGenerationReportSchema,
  ResolutionPlanV2Schema,
  validateWithSchema,
} from "@uig/contracts";
import { ReactGenerationError } from "@uig/generator-react";
import { type PixsoDslClient, PixsoProviderError } from "@uig/provider-pixso";
import { ZodError } from "zod";

import {
  buildGenerateResult,
  buildPlanResult,
  type UigGenerateResult,
  UigGenerateInputSchema,
  type UigPlanResult,
  UigPlanInputSchema,
} from "./results.js";

export type UigToolErrorCode =
  | "UIG_INPUT_INVALID"
  | "UIG_PROVIDER_CONFIG_MISSING"
  | "UIG_PROVIDER_FAILED"
  | "UIG_PACK_INVALID"
  | "UIG_RUN_INVALID"
  | "UIG_GENERATION_FAILED"
  | "UIG_FILESYSTEM_FAILED";

export class UigToolError extends Error {
  readonly name = "UigToolError";

  constructor(
    readonly code: UigToolErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface UigToolDependencies {
  workspaceDir: string;
  extensionRoot: string;
  adapterModulePath: string;
  token: string | undefined;
  now: () => Date;
  createPixsoClient(token: string): PixsoDslClient;
  planFromUrl: typeof planFromUrl;
  generateFromRun: typeof generateFromRun;
}

export function createUigTools(dependencies: UigToolDependencies): {
  plan(input: unknown): Promise<UigPlanResult>;
  generate(input: unknown): Promise<UigGenerateResult>;
} {
  return {
    async plan(input) {
      const parsed = parsePlanInput(input);
      const token = requireToken(dependencies.token);
      const selectedPack = await resolvePackPath(
        dependencies.extensionRoot,
        parsed.designSystem,
      );

      let pixsoClient: PixsoDslClient;
      try {
        pixsoClient = dependencies.createPixsoClient(token);
      } catch (error) {
        throw providerFailure(error);
      }

      let returnedRun: GenerationRun;
      try {
        returnedRun = validateWithSchema(
          GenerationRunSchema,
          await dependencies.planFromUrl({
            url: parsed.url,
            designSystemPackPath: selectedPack,
            workspaceDir: dependencies.workspaceDir,
            pixsoClient,
            now: dependencies.now,
          }),
        );
      } catch (error) {
        if (error instanceof PixsoProviderError) {
          throw providerFailure(error);
        }
        if (error instanceof UigToolError) {
          throw error;
        }
        throw new UigToolError(
          "UIG_FILESYSTEM_FAILED",
          "Planning failed before a valid run was stored",
        );
      }

      try {
        const selected = await readSelectedRun(
          dependencies.workspaceDir,
          returnedRun.runId,
        );
        if (selected.run.runId !== returnedRun.runId) {
          throw new Error("Stored run ID differs from the planned run");
        }
        const snapshot = validateWithSchema(
          DesignSnapshotSchema,
          await readSafeJson(selected.runDir, selected.run.artifacts.snapshot),
        );
        const resolutionPlan = validateWithSchema(
          ResolutionPlanV2Schema,
          await readSafeJson(
            selected.runDir,
            selected.run.artifacts.resolutionPlan,
          ),
        );
        return buildPlanResult({
          run: selected.run,
          runPath: `.uig/runs/${selected.run.runId}`,
          snapshot,
          resolutionPlan,
        });
      } catch (error) {
        if (error instanceof UigToolError) {
          throw error;
        }
        throw new UigToolError(
          "UIG_RUN_INVALID",
          "Stored planning run is invalid",
        );
      }
    },

    async generate(input) {
      const parsed = parseGenerateInput(input);
      let selected: Awaited<ReturnType<typeof readSelectedRun>>;
      let resolutionPlan: ReturnType<
        typeof validateWithSchema<typeof ResolutionPlanV2Schema>
      >;
      try {
        selected = await readSelectedRun(
          dependencies.workspaceDir,
          parsed.runId,
        );
        resolutionPlan = validateWithSchema(
          ResolutionPlanV2Schema,
          await readSafeJson(
            selected.runDir,
            selected.run.artifacts.resolutionPlan,
          ),
        );
      } catch (error) {
        if (error instanceof UigToolError) {
          throw error;
        }
        throw new UigToolError("UIG_RUN_INVALID", "Generation run is invalid");
      }

      const selectedPack = await resolvePackPath(
        dependencies.extensionRoot,
        resolutionPlan.target.designSystem,
      );
      const workerEntrypoint: GenerationWorkerEntrypoint = {
        modulePath: dependencies.adapterModulePath,
        args: ["--generation-worker"],
        execArgv: [],
      };

      let generated: Awaited<ReturnType<typeof generateFromRun>>;
      try {
        generated = await dependencies.generateFromRun({
          runId: parsed.runId,
          workspaceDir: dependencies.workspaceDir,
          explicitPackPath: selectedPack,
          workerEntrypoint,
        });
      } catch (error) {
        if (error instanceof ReactGenerationError) {
          throw new UigToolError(
            "UIG_GENERATION_FAILED",
            `Generation failed with ${error.code}`,
          );
        }
        throw new UigToolError("UIG_GENERATION_FAILED", "Generation failed");
      }

      const expectedOutputPath = `.uig/runs/${parsed.runId}/generated`;
      if (generated.outputPath !== expectedOutputPath) {
        throw new UigToolError(
          "UIG_GENERATION_FAILED",
          "Generation returned an unexpected output path",
        );
      }

      try {
        const reportBytes = await readSafeGeneratedReport(
          dependencies.workspaceDir,
          parsed.runId,
        );
        const report = validateWithSchema(
          ReactGenerationReportSchema,
          JSON.parse(
            new TextDecoder("utf8", { fatal: true }).decode(reportBytes),
          ),
        );
        assertReactGenerationReportIntegrity(report);
        if (
          report.sourceRunId !== parsed.runId ||
          report.status !== generated.status
        ) {
          throw new Error("Generation result differs from its report");
        }
        return buildGenerateResult({
          runId: parsed.runId,
          outputPath: generated.outputPath,
          writeStatus: generated.writeStatus,
          report,
          reportSha256: createHash("sha256").update(reportBytes).digest("hex"),
          resolutionPlan,
        });
      } catch (error) {
        if (error instanceof UigToolError) {
          throw error;
        }
        throw new UigToolError(
          "UIG_GENERATION_FAILED",
          "Generated report is invalid",
        );
      }
    },
  };
}

function parsePlanInput(input: unknown) {
  try {
    return UigPlanInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new UigToolError("UIG_INPUT_INVALID", "Invalid uig_plan input");
    }
    throw error;
  }
}

function parseGenerateInput(input: unknown) {
  try {
    return UigGenerateInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new UigToolError("UIG_INPUT_INVALID", "Invalid uig_generate input");
    }
    throw error;
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
    const metadata = await lstat(candidate);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Pack is not an ordinary directory");
    }
  } catch {
    throw new UigToolError(
      "UIG_PACK_INVALID",
      `Design-system pack ${JSON.stringify(designSystem)} is unavailable`,
    );
  }
  return candidate;
}

async function readSelectedRun(
  workspaceDir: string,
  runId: string,
): Promise<{
  runDir: string;
  run: GenerationRun;
}> {
  const runDir = join(workspaceDir, ".uig", "runs", runId);
  const metadata = await lstat(runDir);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Run path is not an ordinary directory");
  }
  const run = validateWithSchema(
    GenerationRunSchema,
    await readSafeJson(runDir, "run.json"),
  );
  if (run.runId !== runId) {
    throw new Error("Run metadata ID differs from its selected directory");
  }
  return { runDir, run };
}

async function readSafeJson(
  directory: string,
  artifactName: string,
): Promise<unknown> {
  const bytes = await readSafeArtifact(directory, artifactName);
  return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
}

async function readSafeArtifact(
  directory: string,
  artifactName: string,
): Promise<Uint8Array> {
  if (
    artifactName.length === 0 ||
    artifactName === "." ||
    artifactName === ".." ||
    artifactName.includes("/") ||
    artifactName.includes("\\")
  ) {
    throw new Error("Unsafe run artifact name");
  }
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new Error("Platform cannot safely open run artifacts");
  }
  const handle = await open(
    join(directory, artifactName),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw new Error("Run artifact is not an ordinary file");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function readSafeGeneratedReport(
  workspaceDir: string,
  runId: string,
): Promise<Uint8Array> {
  const path = join(
    workspaceDir,
    ".uig",
    "runs",
    runId,
    "generated",
    "generation-report.json",
  );
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw new Error("Generation report is not an ordinary file");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
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
