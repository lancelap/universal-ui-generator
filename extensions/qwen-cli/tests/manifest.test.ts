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
  "commands/uig/scan.md",
  "commands/uig/components.md",
  "commands/uig/map.md",
  "commands/uig/status.md",
] as const;

describe("Qwen extension manifest and commands", () => {
  it("keeps the public Git installation proprietary", async () => {
    const packageJson = JSON.parse(
      await readFile(join(repoRoot, "package.json"), "utf8"),
    );
    const extensionPackageJson = JSON.parse(
      await readFile(
        join(repoRoot, "extensions/qwen-cli/package.json"),
        "utf8",
      ),
    );
    const license = await readFile(join(repoRoot, "LICENSE"), "utf8");

    expect(packageJson.private).toBe(true);
    expect(packageJson.license).toBe("UNLICENSED");
    expect(extensionPackageJson.private).toBe(true);
    expect(extensionPackageJson.license).toBe("UNLICENSED");
    expect(license).toContain("Copyright (c) 2026 lancelap");
    expect(license).toContain("All rights reserved.");
  });

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

  it("ships invariant context and exactly seven safe commands", async () => {
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

    const scan = contents.find(
      (entry) => entry.path === "commands/uig/scan.md",
    )!.text;
    const components = contents.find(
      (entry) => entry.path === "commands/uig/components.md",
    )!.text;
    const map = contents.find(
      (entry) => entry.path === "commands/uig/map.md",
    )!.text;
    const status = contents.find(
      (entry) => entry.path === "commands/uig/status.md",
    )!.text;
    expect(scan).toContain("scan_project_components");
    expect(scan).toContain("Do not search the repository yourself");
    expect(components).toContain("project_component_search");
    expect(components).toContain("get_component_contract");
    expect(components).toContain("Before any other action");
    expect(components).toContain("Do not use filesystem or shell tools");
    expect(components).toContain("If that MCP call is unavailable, stop");
    expect(components).toContain("Omit `semanticRole` and `status`");
    expect(components).toContain("Omit `query` and `status`");
    expect(components).not.toContain("read_file");
    expect(map).toContain("explicit confirmation");
    expect(map).toContain("confirm_project_component_mappings");
    expect(map).toContain("remove_project_component_mappings");
    expect(map).toContain("Omit `semanticRole` and `status`");
    expect(status).toContain("get_project_ui_context_status");
    expect(status).toContain("Do not run a scan automatically");

    const qwen = contents.find((entry) => entry.path === "QWEN.md")!.text;
    expect(qwen).toContain("uig_plan");
    expect(qwen).toContain("uig_generate");
    expect(qwen).toContain("Never call Pixso Remote MCP directly");
    expect(qwen).toContain("Never replace `/uig:scan` with repository search");
    expect(qwen).toContain("never edit `.ui-context/*.json` directly");
    expect(qwen).toContain("`suggested` mappings are not generation authority");
    expect(qwen).toContain("`/uig:status` is read-only");
    expect(qwen).toContain("Never read `.ui-context/generated` files directly");
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
