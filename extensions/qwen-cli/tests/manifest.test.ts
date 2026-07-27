import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const extensionFiles = [
  "qwen-extension.json",
  "QWEN.md",
  "commands/uig/plan.md",
  "commands/uig/generate.md",
  "commands/uig/pixso-to-react.md",
] as const;

describe("Qwen extension manifest and commands", () => {
  it("matches the exact portable Qwen Code 0.21.0 contract", async () => {
    const manifest = JSON.parse(
      await readFile(join(repoRoot, "qwen-extension.json"), "utf8"),
    );

    expect(manifest).toEqual({
      name: "universal-ui-generator",
      version: "0.1.0",
      contextFileName: "QWEN.md",
      commands: "commands",
      mcpServers: {
        uig: {
          command: "node",
          args: ["${extensionPath}${/}dist${/}qwen-adapter.mjs"],
          cwd: "${workspacePath}",
        },
      },
      settings: [
        {
          name: "Pixso access token",
          description: "Access token used only by the Pixso Remote MCP client",
          envVar: "PIXSO_ACCESS_TOKEN",
          sensitive: true,
        },
      ],
    });
    expect(manifest).not.toHaveProperty("trust");
  });

  it("ships invariant context and exactly three safe commands", async () => {
    await Promise.all(
      extensionFiles.map((path) => access(join(repoRoot, path))),
    );
    const contents = await Promise.all(
      extensionFiles.map(async (path) => ({
        path,
        text: await readFile(join(repoRoot, path), "utf8"),
      })),
    );
    const combined = contents
      .map(({ path, text }) => `${path}\n${text}`)
      .join("\n");

    expect(combined).not.toMatch(
      /\/Users\/|C:\\Users\\|dsl-ui-direct|gigacode-extension|gigacode-mcp|your_access_token/,
    );
    expect(combined).not.toMatch(
      /get_node_dsl|pixso_fetch_node|raw Pixso DSL\s+through/i,
    );
    expect(
      await access(join(repoRoot, "agents"))
        .then(() => true)
        .catch(() => false),
    ).toBe(false);

    const plan = contents.find(
      (entry) => entry.path === "commands/uig/plan.md",
    )!.text;
    const generate = contents.find(
      (entry) => entry.path === "commands/uig/generate.md",
    )!.text;
    const combinedCommand = contents.find(
      (entry) => entry.path === "commands/uig/pixso-to-react.md",
    )!.text;
    expect(plan).toContain("uig_plan");
    expect(plan).not.toContain("uig_generate");
    expect(generate).toContain("uig_generate");
    expect(generate).not.toContain("uig_plan");
    expect(combinedCommand.indexOf("uig_plan")).toBeLessThan(
      combinedCommand.indexOf("uig_generate"),
    );
  });

  it("documents installation, lifecycle, usage, and boundaries", async () => {
    const readme = await readFile(join(repoRoot, "README.md"), "utf8");
    for (const required of [
      "Qwen Code 0.21.0",
      "qwen extensions install lancelap/universal-ui-generator",
      "qwen extensions update universal-ui-generator",
      "qwen extensions enable universal-ui-generator",
      "qwen extensions disable universal-ui-generator",
      "qwen extensions uninstall universal-ui-generator",
      'qwen extensions settings set universal-ui-generator "Pixso access token"',
      "/uig:plan",
      "/uig:generate",
      "/uig:pixso-to-react",
      "qwen extensions link",
      "export PIXSO_ACCESS_TOKEN",
      "Qwen Code 0.21.0 setting fallback",
      "Supported extension runtime: macOS and Linux",
      "Concurrent same-user filesystem mutation is outside the v0.1 threat model",
      ".uig",
      "business logic",
    ]) {
      expect(readme).toContain(required);
    }
    expect(readme).not.toMatch(
      /dsl-ui-direct|gigacode-extension|gigacode-mcp|your_access_token|\/Users\//,
    );
  });
});
