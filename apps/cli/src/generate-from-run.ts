import { fork, type ChildProcess } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { ReactGenerationError } from "@uig/generator-react";

import type {
  GenerateWorkerInbound,
  GenerateWorkerOutbound,
  PinnedRunIdentity,
} from "./generate-worker-protocol.js";

const runIdPattern = /^run_[A-Za-z0-9_-]+$/;
const require = createRequire(import.meta.url);

export interface GenerationWorkerEntrypoint {
  modulePath: string;
  args: string[];
  execArgv: string[];
}

export async function generateFromRun(input: {
  runId: string;
  workspaceDir: string;
  explicitPackPath?: string;
  workerEntrypoint?: GenerationWorkerEntrypoint;
  /** @internal Runs after the pinned worker is ready and before publication. */
  testHooks?: {
    beforeInstall?: () => Promise<void>;
  };
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
    ]);
    const pinned = await selectPinnedRun(runDir);
    const result = await runPinnedWorker({
      runId: input.runId,
      canonicalRunDir: pinned.canonical,
      expectedIdentity: pinned.identity,
      ...(input.explicitPackPath
        ? { explicitPackPath: resolve(input.explicitPackPath) }
        : {}),
      ...(input.testHooks?.beforeInstall
        ? { beforePublish: input.testHooks.beforeInstall }
        : {}),
      workerEntrypoint: input.workerEntrypoint ?? defaultWorkerEntrypoint(),
    });
    return {
      outputPath: relative(input.workspaceDir, join(runDir, "generated"))
        .split(sep)
        .join("/"),
      status: result.status,
      writeStatus: result.writeStatus,
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

async function selectPinnedRun(runDir: string): Promise<{
  canonical: string;
  identity: PinnedRunIdentity;
}> {
  const selected = await lstat(runDir, { bigint: true });
  if (!selected.isDirectory() || selected.isSymbolicLink()) {
    invalid("Generation run path must be an ordinary directory");
  }
  const canonical = await realpath(runDir);
  const canonicalMetadata = await lstat(canonical, { bigint: true });
  const identity = identityOf(canonicalMetadata);
  if (!sameIdentity(identity, identityOf(selected))) {
    invalid("Generation run changed while it was selected");
  }
  return { canonical, identity };
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

async function runPinnedWorker(input: {
  runId: string;
  canonicalRunDir: string;
  expectedIdentity: PinnedRunIdentity;
  explicitPackPath?: string;
  beforePublish?: () => Promise<void>;
  workerEntrypoint: GenerationWorkerEntrypoint;
}): Promise<Extract<GenerateWorkerOutbound, { type: "result" }>> {
  const worker = fork(
    input.workerEntrypoint.modulePath,
    input.workerEntrypoint.args,
    {
      cwd: input.canonicalRunDir,
      env: withoutPixsoToken(process.env),
      execArgv: input.workerEntrypoint.execArgv,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  const initialization: GenerateWorkerInbound = {
    type: "initialize",
    runId: input.runId,
    expectedIdentity: input.expectedIdentity,
    ...(input.explicitPackPath
      ? { explicitPackPath: input.explicitPackPath }
      : {}),
  };
  const result = awaitWorkerResult(worker, input.beforePublish);
  try {
    await sendToWorker(worker, initialization);
    return await result;
  } catch (error) {
    worker.kill();
    throw error;
  }
}

function withoutPixsoToken(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sanitized = { ...environment };
  delete sanitized.PIXSO_ACCESS_TOKEN;
  return sanitized;
}

function defaultWorkerEntrypoint(): GenerationWorkerEntrypoint {
  const sourceExtension = extname(fileURLToPath(import.meta.url));
  return {
    modulePath: fileURLToPath(
      new URL(
        `./generate-from-run-worker-entry${sourceExtension}`,
        import.meta.url,
      ),
    ),
    args: [],
    execArgv:
      sourceExtension === ".ts" ? ["--import", require.resolve("tsx")] : [],
  };
}

function awaitWorkerResult(
  worker: ChildProcess,
  beforePublish: (() => Promise<void>) | undefined,
): Promise<Extract<GenerateWorkerOutbound, { type: "result" }>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void): void => {
      if (!settled) {
        settled = true;
        action();
      }
    };
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code, signal) =>
      finish(() =>
        reject(
          new Error(
            `Generate worker exited before a result (${signal ?? code ?? "unknown"})`,
          ),
        ),
      ),
    );
    worker.on("message", (message: GenerateWorkerOutbound) => {
      if (message.type === "ready-to-publish") {
        void (async () => {
          try {
            await beforePublish?.();
            await sendToWorker(worker, {
              type: "publish",
            } satisfies GenerateWorkerInbound);
          } catch (error) {
            finish(() => reject(error));
          }
        })();
        return;
      }
      if (message.type === "error") {
        finish(() =>
          reject(new ReactGenerationError(message.code, message.message)),
        );
        return;
      }
      finish(() => resolve(message));
    });
  });
}

async function sendToWorker(
  worker: ChildProcess,
  message: GenerateWorkerInbound,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    worker.send(message, (error) => (error ? reject(error) : resolve()));
  });
}

function identityOf(metadata: { dev: bigint; ino: bigint }): PinnedRunIdentity {
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

function invalid(message: string): never {
  throw new ReactGenerationError("GENERATION_INPUT_INVALID", message);
}
