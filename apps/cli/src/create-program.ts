import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { loadDesignSystemPack } from "@uig/component-catalog";
import { stableStringify } from "@uig/contracts";
import { createArtifactStore, queryDesignContext } from "@uig/design-context";
import { normalizePixsoDesign } from "@uig/design-normalizer";
import { fetchPixsoSnapshot, type PixsoDslClient } from "@uig/provider-pixso";
import { Command } from "commander";

import { generateFromRun } from "./generate-from-run.js";
import { planFromSnapshot } from "./plan-from-snapshot.js";
import { planFromUrl } from "./plan-from-url.js";
import { resolveDesignSystemPackPath } from "./resolve-design-system-pack.js";
import { atomicJson } from "./write-run-artifacts.js";

export interface UigCommand extends Command {
  exitCode?: number;
}

export function createProgram(dependencies: {
  cwd: () => string;
  now: () => Date;
  createPixsoClient: () => PixsoDslClient;
  generateFromRun?: typeof generateFromRun;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}): UigCommand {
  const program = new Command() as UigCommand;
  program
    .name("uig")
    .description("Deterministic design-to-UI planning CLI")
    .version("0.1.0");
  program.configureOutput({
    writeOut: (text) => dependencies.stdout.write(text),
    writeErr: (text) => dependencies.stderr.write(text),
  });

  program
    .command("fetch")
    .argument("<url>")
    .action(async (url: string) => {
      const snapshot = await fetchPixsoSnapshot({
        url,
        client: dependencies.createPixsoClient(),
        store: createArtifactStore(join(dependencies.cwd(), ".uig")),
        now: dependencies.now,
      });
      dependencies.stdout.write(`${snapshot.artifactId}\n`);
      program.exitCode = 0;
    });

  program
    .command("normalize")
    .argument("<artifact-id>")
    .action(async (artifactId: string) => {
      const store = createArtifactStore(join(dependencies.cwd(), ".uig"));
      const [bytes, metadata] = await Promise.all([
        store.read(artifactId),
        store.describe(artifactId),
      ]);
      const rawDsl = JSON.parse(new TextDecoder().decode(bytes));
      const designIr = normalizePixsoDesign({
        artifactId,
        rootNodeId: metadata.nodeId,
        rawDsl,
      });
      const destination = join(dependencies.cwd(), ".uig", "design-ir.json");
      await mkdir(join(dependencies.cwd(), ".uig"), { recursive: true });
      await atomicJson(destination, designIr);
      dependencies.stdout.write(".uig/design-ir.json\n");
      program.exitCode = 0;
    });

  program
    .command("plan")
    .option("--url <url>")
    .option("--snapshot <artifact-id>")
    .requiredOption("--design-system <id-or-path>")
    .action(
      async (options: {
        url?: string;
        snapshot?: string;
        designSystem: string;
      }) => {
        if (Boolean(options.url) === Boolean(options.snapshot)) {
          throw new Error(
            "Exactly one of --url or --snapshot must be provided",
          );
        }
        const packPath = resolveDesignSystemPackPath(options.designSystem);
        const run = options.url
          ? await planFromUrl({
              url: options.url,
              designSystemPackPath: packPath,
              workspaceDir: dependencies.cwd(),
              pixsoClient: dependencies.createPixsoClient(),
              now: dependencies.now,
            })
          : await planFromSnapshot({
              artifactId: options.snapshot!,
              designSystemPackPath: packPath,
              workspaceDir: dependencies.cwd(),
              now: dependencies.now,
            });
        dependencies.stdout.write(`.uig/runs/${run.runId}\n`);
        program.exitCode = run.status === "blocked" ? 2 : 0;
      },
    );

  program
    .command("generate")
    .requiredOption("--run <run-id>")
    .option("--design-system-pack <path>")
    .action(async (options: { run: string; designSystemPack?: string }) => {
      const result = await (dependencies.generateFromRun ?? generateFromRun)({
        runId: options.run,
        workspaceDir: dependencies.cwd(),
        ...(options.designSystemPack
          ? { explicitPackPath: options.designSystemPack }
          : {}),
      });
      dependencies.stdout.write(
        `${JSON.stringify({
          outputPath: result.outputPath,
          runId: options.run,
          status: result.status,
          writeStatus: result.writeStatus,
        })}\n`,
      );
      program.exitCode = result.status === "blocked" ? 2 : 0;
    });

  program
    .command("inspect")
    .requiredOption("--artifact <artifact-id>")
    .requiredOption("--node <node-id>")
    .option(
      "--include <fields>",
      "comma-separated fields",
      "geometry,appearance",
    )
    .action(
      async (options: { artifact: string; node: string; include: string }) => {
        const store = createArtifactStore(join(dependencies.cwd(), ".uig"));
        const [bytes, metadata] = await Promise.all([
          store.read(options.artifact),
          store.describe(options.artifact),
        ]);
        const rawDsl = JSON.parse(new TextDecoder().decode(bytes));
        const ir = normalizePixsoDesign({
          artifactId: options.artifact,
          rootNodeId: metadata.nodeId,
          rawDsl,
        });
        const result = queryDesignContext(ir, {
          selector: "node",
          nodeId: options.node,
        });
        const selected = result.items[0];
        if (!selected || !("geometry" in selected)) {
          throw new Error(`Design node not found: ${options.node}`);
        }
        const fields = new Set(options.include.split(","));
        dependencies.stdout.write(
          stableStringify({
            id: selected.id,
            ...(fields.has("geometry") ? { geometry: selected.geometry } : {}),
            ...(fields.has("appearance")
              ? { appearance: selected.appearance }
              : {}),
          }),
        );
        program.exitCode = 0;
      },
    );

  const pack = program.command("pack");
  pack
    .command("validate")
    .argument("<path>")
    .action(async (path: string) => {
      const loaded = await loadDesignSystemPack(path);
      dependencies.stdout.write(
        `${loaded.manifest.id}@${loaded.manifest.version}\n`,
      );
      program.exitCode = 0;
    });

  return program;
}
