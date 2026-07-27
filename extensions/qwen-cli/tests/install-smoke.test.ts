import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { planFromUrl } from "@uig/cli/plan-from-url";
import type { PixsoDslClient } from "@uig/provider-pixso";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const pixsoUrl =
  "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314";

describe("Qwen Git installation copy", () => {
  it("lists tools and generates without source or node_modules", async () => {
    const root = await mkdtemp(join(tmpdir(), "uig-qwen-install-"));
    const installRoot = join(root, "extension");
    const workspace = join(root, "workspace");
    try {
      await Promise.all([
        cp(
          join(repoRoot, "qwen-extension.json"),
          join(installRoot, "qwen-extension.json"),
          { recursive: true },
        ),
        cp(join(repoRoot, "QWEN.md"), join(installRoot, "QWEN.md"), {
          recursive: true,
        }),
        cp(join(repoRoot, "commands"), join(installRoot, "commands"), {
          recursive: true,
        }),
        cp(join(repoRoot, "dist"), join(installRoot, "dist"), {
          recursive: true,
        }),
        cp(
          join(repoRoot, "design-system-packs"),
          join(installRoot, "design-system-packs"),
          { recursive: true },
        ),
      ]);

      const rawDsl = await readFile(
        join(repoRoot, "fixtures", "pixso", "modal-4-314", "source.json"),
      );
      const run = await planFromUrl({
        url: pixsoUrl,
        designSystemPackPath: join(
          repoRoot,
          "design-system-packs",
          "sber-space-ui",
        ),
        workspaceDir: workspace,
        pixsoClient: staticPixsoClient(rawDsl),
        now: () => new Date("2026-07-27T00:00:00.000Z"),
      });

      const stderr: Buffer[] = [];
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [join(installRoot, "dist", "qwen-adapter.mjs")],
        cwd: workspace,
        env: {
          PATH: process.env.PATH ?? "",
          PIXSO_ACCESS_TOKEN: "install-smoke-token",
        },
        stderr: "pipe",
      });
      transport.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
      const client = new Client({
        name: "uig-install-smoke",
        version: "0.1.0",
      });
      try {
        await client.connect(transport);
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error(
          `Installed adapter failed to initialize: ${Buffer.concat(stderr).toString("utf8")}`,
          { cause: error },
        );
      }
      const listed = await client.listTools();
      const generated = await client.callTool({
        name: "uig_generate",
        arguments: { runId: run.runId },
      });
      await client.close();

      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
        "uig_generate",
        "uig_plan",
      ]);
      expect(generated.structuredContent).toMatchObject({
        schema: "uig-qwen-generate-result/v1",
        status: "generated",
        runId: run.runId,
      });
      expect(
        await readFile(
          join(
            workspace,
            ".uig",
            "runs",
            run.runId,
            "generated",
            "GeneratedModal.tsx",
          ),
          "utf8",
        ),
      ).toContain("export");
      await expect(
        readFile(join(installRoot, "node_modules")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(Buffer.concat(stderr).toString("utf8")).toBe("");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});

function staticPixsoClient(bytes: Uint8Array): PixsoDslClient {
  return {
    async getNodeDsl() {
      return bytes;
    },
  };
}
