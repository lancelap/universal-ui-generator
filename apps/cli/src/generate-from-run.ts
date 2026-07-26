import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { loadDesignSystemPackV2 } from "@uig/component-catalog";
import {
  DesignIRV2Schema,
  GenerationRunSchema,
  ResolutionPlanV2Schema,
  UiManifestV2Schema,
  validateWithSchema,
} from "@uig/contracts";
import {
  generateReactBundle,
  ReactGenerationError,
} from "@uig/generator-react";

import { resolveDesignSystemPackPath } from "./resolve-design-system-pack.js";
import { writeGeneratedBundleAtomically } from "./write-generated-bundle.js";

const runIdPattern = /^run_[A-Za-z0-9_-]+$/;

export async function generateFromRun(input: {
  runId: string;
  workspaceDir: string;
  explicitPackPath?: string;
}): Promise<{
  outputPath: string;
  status: "generated" | "blocked";
  writeStatus: "written" | "identical";
}> {
  try {
    if (!runIdPattern.test(input.runId)) {
      invalid(`Unsafe run ID ${JSON.stringify(input.runId)}`);
    }
    const uigDir = resolve(input.workspaceDir, ".uig");
    const runsDir = join(uigDir, "runs");
    const runDir = join(runsDir, input.runId);
    await Promise.all([
      assertOrdinaryDirectory(uigDir, "Generator workspace"),
      assertOrdinaryDirectory(runsDir, "Generation runs"),
      assertOrdinaryDirectory(runDir, "Generation run"),
    ]);
    const runPath = await resolveArtifactPath(runDir, "run.json");
    const run = validateWithSchema(
      GenerationRunSchema,
      await readJson(runPath),
    );
    if (run.runId !== input.runId) {
      invalid(
        `Run metadata ID ${JSON.stringify(run.runId)} does not match ${JSON.stringify(input.runId)}`,
      );
    }

    const [designIrPath, uiManifestPath, resolutionPlanPath] =
      await Promise.all([
        resolveArtifactPath(runDir, run.artifacts.designIr),
        resolveArtifactPath(runDir, run.artifacts.uiManifest),
        resolveArtifactPath(runDir, run.artifacts.resolutionPlan),
      ]);
    const [designIrValue, uiManifestValue, resolutionPlanValue] =
      await Promise.all([
        readJson(designIrPath),
        readJson(uiManifestPath),
        readJson(resolutionPlanPath),
      ]);
    const designIr = validateWithSchema(DesignIRV2Schema, designIrValue);
    const uiManifest = validateWithSchema(UiManifestV2Schema, uiManifestValue);
    const resolutionPlan = validateWithSchema(
      ResolutionPlanV2Schema,
      resolutionPlanValue,
    );
    const packPath =
      input.explicitPackPath ??
      resolveDesignSystemPackPath(resolutionPlan.target.designSystem);
    const pack = await loadDesignSystemPackV2(packPath);
    const bundle = generateReactBundle({
      sourceRunId: input.runId,
      designIr,
      uiManifest,
      resolutionPlan,
      pack,
    });
    const destination = join(runDir, "generated");
    const writeStatus = await writeGeneratedBundleAtomically({
      destination,
      bundle,
    });
    return {
      outputPath: relative(input.workspaceDir, destination)
        .split(sep)
        .join("/"),
      status: bundle.status,
      writeStatus,
    };
  } catch (error) {
    if (error instanceof ReactGenerationError) {
      throw error;
    }
    throw new ReactGenerationError(
      "GENERATION_INPUT_INVALID",
      "Generation run could not be loaded",
      { cause: error },
    );
  }
}

async function assertOrdinaryDirectory(
  directory: string,
  label: string,
): Promise<void> {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    invalid(`${label} path must be an ordinary directory`);
  }
}

async function resolveArtifactPath(
  runDir: string,
  artifactPath: string,
): Promise<string> {
  if (
    artifactPath.length === 0 ||
    isAbsolute(artifactPath) ||
    artifactPath.includes("\\")
  ) {
    invalid(`Unsafe run artifact path ${JSON.stringify(artifactPath)}`);
  }
  const resolved = resolve(runDir, artifactPath);
  const lexicalRelative = relative(runDir, resolved);
  if (
    lexicalRelative === ".." ||
    lexicalRelative.startsWith(`..${sep}`) ||
    isAbsolute(lexicalRelative)
  ) {
    invalid(`Run artifact escapes its run: ${JSON.stringify(artifactPath)}`);
  }
  const [actualRunDir, actual] = await Promise.all([
    realpath(runDir),
    realpath(resolved),
  ]);
  const actualRelative = relative(actualRunDir, actual);
  if (
    actualRelative === ".." ||
    actualRelative.startsWith(`..${sep}`) ||
    isAbsolute(actualRelative)
  ) {
    invalid(`Run artifact escapes its run: ${JSON.stringify(artifactPath)}`);
  }
  return actual;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function invalid(message: string): never {
  throw new ReactGenerationError("GENERATION_INPUT_INVALID", message);
}
