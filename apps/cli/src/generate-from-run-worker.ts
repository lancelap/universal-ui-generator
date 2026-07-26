import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";

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
  type ReactGenerationErrorCode,
} from "@uig/generator-react";

import type {
  GenerateWorkerInbound,
  GenerateWorkerOutbound,
  PinnedRunIdentity,
} from "./generate-worker-protocol.js";
import { resolveDesignSystemPackPath } from "./resolve-design-system-pack.js";
import { writeGeneratedBundleAtomically } from "./write-generated-bundle.js";

void runWorker();

async function runWorker(): Promise<void> {
  let directoryHandle: FileHandle | undefined;
  try {
    const initialization = await nextMessage("initialize");
    directoryHandle = await open(".", constants.O_RDONLY);
    const actualIdentity = await identityOf(directoryHandle);
    if (!sameIdentity(actualIdentity, initialization.expectedIdentity)) {
      invalid("Pinned generation run identity does not match selection");
    }

    const run = validateWithSchema(
      GenerationRunSchema,
      await readSafeJson("run.json"),
    );
    if (run.runId !== initialization.runId) {
      invalid(
        `Run metadata ID ${JSON.stringify(run.runId)} does not match ${JSON.stringify(initialization.runId)}`,
      );
    }
    const [designIrValue, uiManifestValue, resolutionPlanValue] =
      await Promise.all([
        readSafeJson(run.artifacts.designIr),
        readSafeJson(run.artifacts.uiManifest),
        readSafeJson(run.artifacts.resolutionPlan),
      ]);
    const designIr = validateWithSchema(DesignIRV2Schema, designIrValue);
    const uiManifest = validateWithSchema(UiManifestV2Schema, uiManifestValue);
    const resolutionPlan = validateWithSchema(
      ResolutionPlanV2Schema,
      resolutionPlanValue,
    );
    const packPath =
      initialization.explicitPackPath ??
      resolveDesignSystemPackPath(resolutionPlan.target.designSystem);
    const pack = await loadDesignSystemPackV2(packPath);
    const bundle = generateReactBundle({
      sourceRunId: initialization.runId,
      designIr,
      uiManifest,
      resolutionPlan,
      pack,
    });

    const publication = nextMessage("publish");
    await send({ type: "ready-to-publish" });
    await publication;
    if (
      !sameIdentity(
        await identityOf(directoryHandle),
        initialization.expectedIdentity,
      )
    ) {
      invalid("Pinned generation run identity changed before publication");
    }
    const writeStatus = await writeGeneratedBundleAtomically({
      destination: "generated",
      bundle,
    });
    await send({
      type: "result",
      status: bundle.status,
      writeStatus,
    });
  } catch (error) {
    await send(workerError(error));
  } finally {
    await directoryHandle?.close();
    if (process.connected) {
      process.disconnect();
    }
  }
}

async function readSafeJson(path: string): Promise<unknown> {
  if (
    path.length === 0 ||
    path === "." ||
    path === ".." ||
    path.includes("/") ||
    path.includes("\\")
  ) {
    invalid(`Unsafe run artifact path ${JSON.stringify(path)}`);
  }
  if (typeof constants.O_NOFOLLOW !== "number") {
    invalid("This platform cannot safely open generation artifacts");
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      invalid(`Generation artifact is not an ordinary file: ${path}`);
    }
    return JSON.parse(await handle.readFile("utf8"));
  } finally {
    await handle.close();
  }
}

async function identityOf(handle: FileHandle): Promise<PinnedRunIdentity> {
  const metadata = await handle.stat({ bigint: true });
  if (!metadata.isDirectory()) {
    invalid("Pinned generation run is not a directory");
  }
  return {
    dev: metadata.dev.toString(),
    ino: metadata.ino.toString(),
  };
}

function sameIdentity(
  left: PinnedRunIdentity,
  right: PinnedRunIdentity,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function nextMessage<T extends GenerateWorkerInbound["type"]>(
  type: T,
): Promise<Extract<GenerateWorkerInbound, { type: T }>> {
  return new Promise((resolve, reject) => {
    process.once("message", (message: unknown) => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("type" in message) ||
        message.type !== type
      ) {
        reject(new Error(`Unexpected generate worker message; wanted ${type}`));
        return;
      }
      resolve(message as Extract<GenerateWorkerInbound, { type: T }>);
    });
  });
}

async function send(message: GenerateWorkerOutbound): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (!process.send) {
      reject(new Error("Generate worker requires an IPC channel"));
      return;
    }
    process.send(message, (error) => (error ? reject(error) : resolve()));
  });
}

function workerError(error: unknown): GenerateWorkerOutbound {
  if (error instanceof ReactGenerationError) {
    return {
      type: "error",
      code: error.code,
      message: error.message,
    };
  }
  return {
    type: "error",
    code: "GENERATION_INPUT_INVALID" satisfies ReactGenerationErrorCode,
    message:
      error instanceof Error ? error.message : "Generation worker failed",
  };
}

function invalid(message: string): never {
  throw new ReactGenerationError("GENERATION_INPUT_INVALID", message);
}
