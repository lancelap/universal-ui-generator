import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { type GenerationRun, stableStringify } from "@uig/contracts";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const bundlePath = fileURLToPath(
  new URL("../../../dist/qwen-adapter.mjs", import.meta.url),
);
const provenancePath = fileURLToPath(
  new URL("../../../dist/qwen-adapter.provenance.json", import.meta.url),
);
const lockfilePath = fileURLToPath(
  new URL("../../../pnpm-lock.yaml", import.meta.url),
);

describe("Qwen adapter bundle", () => {
  it("has matching stable provenance and no forbidden embedded data", async () => {
    const [bundleBytes, provenanceBytes, lockfileBytes] = await Promise.all([
      readFile(bundlePath),
      readFile(provenancePath),
      readFile(lockfilePath),
    ]);
    const bundle = bundleBytes.toString("utf8");
    const provenance = JSON.parse(provenanceBytes.toString("utf8"));

    expect(provenance).toEqual({
      schema: "uig-qwen-adapter-provenance/v1",
      artifact: "dist/qwen-adapter.mjs",
      sha256: sha256(bundleBytes),
      sourceEntry: "extensions/qwen-cli/src/server.ts",
      buildCommand: "pnpm build:qwen-extension",
      lockfile: "pnpm-lock.yaml",
      lockfileSha256: sha256(lockfileBytes),
      node: ">=22",
      bundler: "esbuild@0.28.1",
    });
    expect(bundle).not.toMatch(/\/\/[#@]\s*sourceMappingURL=/);
    expect(bundle).not.toContain("/Users/");
    expect(bundle).not.toContain("\\Users\\");
    expect(bundle).not.toContain("fixtures/");
    expect(bundle).not.toContain("PIXSO_ACCESS_TOKEN=");
    expect(bundle).not.toContain("your_access_token");
    expect(repoRoot).not.toBe("");
  });

  it("serves exactly two tools over stdio and forks itself for generation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "uig-qwen-stdio-"));
    const stderr: Buffer[] = [];
    const transportErrors: string[] = [];
    const runId = "run_qwen_stdio";
    try {
      await writeStoredGenerationRun(workspace, runId);
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [bundlePath],
        cwd: workspace,
        env: {
          PATH: process.env.PATH ?? "",
          PIXSO_ACCESS_TOKEN: "stdio-test-token",
        },
        stderr: "pipe",
      });
      transport.stderr?.on("data", (chunk: Buffer) => {
        stderr.push(chunk);
      });
      transport.onerror = (error) => {
        transportErrors.push(error.message);
      };
      const client = new Client({
        name: "uig-qwen-stdio-test",
        version: "0.1.0",
      });
      await client.connect(transport);

      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
        "uig_generate",
        "uig_plan",
      ]);
      for (const tool of listed.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.outputSchema).toBeDefined();
      }

      const generated = await client.callTool({
        name: "uig_generate",
        arguments: { runId },
      });
      expect(generated.isError).not.toBe(true);
      expect(generated.structuredContent).toMatchObject({
        schema: "uig-qwen-generate-result/v1",
        status: "generated",
        runId,
      });
      expect(
        await readFile(
          join(
            workspace,
            ".uig",
            "runs",
            runId,
            "generated",
            "GeneratedModal.tsx",
          ),
          "utf8",
        ),
      ).toContain("export");

      await client.close();
      expect(transportErrors).toEqual([]);
      expect(Buffer.concat(stderr).toString("utf8")).toBe("");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeStoredGenerationRun(
  workspace: string,
  runId: string,
): Promise<void> {
  const fixtureRoot = join(repoRoot, "fixtures", "react-generation", "modal");
  const runDir = join(workspace, ".uig", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const run: GenerationRun = {
    schema: "generation-run/v1",
    runId,
    status: "completed",
    stages: {
      fetch: "skipped",
      normalize: "completed",
      summarize: "completed",
      plan: "completed",
      resolve: "completed",
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
  const [designIr, uiManifest, resolutionPlan] = await Promise.all([
    readFile(join(fixtureRoot, "source.design-ir.json")),
    readFile(join(fixtureRoot, "source.ui-manifest.json")),
    readFile(join(fixtureRoot, "sber-space-ui", "resolution-plan.json")),
  ]);
  await Promise.all([
    writeFile(join(runDir, "run.json"), stableStringify(run)),
    writeFile(join(runDir, run.artifacts.designIr), designIr),
    writeFile(join(runDir, run.artifacts.uiManifest), uiManifest),
    writeFile(join(runDir, run.artifacts.resolutionPlan), resolutionPlan),
  ]);
}
