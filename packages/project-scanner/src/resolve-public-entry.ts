import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { UiContextConfigV1 } from "@uig/contracts";
import ts from "typescript";

import type { ResolvedPublicRoot } from "./types.js";
import { ProjectScannerError } from "./types.js";

export async function resolveConfiguredPublicRoots(input: {
  workspaceDir: string;
  config: UiContextConfigV1;
}): Promise<ResolvedPublicRoot[]> {
  const workspace = await realpath(input.workspaceDir);
  const compilerOptions = loadCompilerOptions(workspace);
  const roots = [
    ...input.config.componentRoots.map((root) => ({
      ...root,
      kind: "component" as const,
    })),
    ...input.config.iconRoots.map((root) => ({
      ...root,
      kind: "icon" as const,
    })),
  ];
  const output: ResolvedPublicRoot[] = [];
  for (const root of roots) {
    assertLexicalPath(root.path);
    assertLexicalPath(root.entry);
    const rootPath = resolve(workspace, root.path);
    const entryPath = resolve(workspace, root.entry);
    assertContained(workspace, rootPath);
    assertContained(workspace, entryPath);
    await assertOrdinaryPath(workspace, root.path, "directory");
    await assertOrdinaryPath(workspace, root.entry, "file");

    const resolved = ts.resolveModuleName(
      root.importSource,
      join(workspace, "__uig_import_probe__.tsx"),
      compilerOptions,
      ts.sys,
    ).resolvedModule;
    if (!resolved) {
      throw new ProjectScannerError(
        "PUBLIC_IMPORT_SOURCE_UNRESOLVED",
        `Public import ${root.importSource} cannot be resolved`,
      );
    }
    const resolvedPath = await canonicalModulePath(resolved.resolvedFileName);
    const canonicalEntry = await realpath(entryPath);
    if (resolvedPath !== canonicalEntry) {
      throw new ProjectScannerError(
        "PUBLIC_IMPORT_SOURCE_MISMATCH",
        `Public import ${root.importSource} resolves to a different entry`,
      );
    }
    output.push({ ...root, absoluteEntryPath: canonicalEntry });
  }
  return output.sort((a, b) => a.importSource.localeCompare(b.importSource));
}

function loadCompilerOptions(workspace: string): ts.CompilerOptions {
  const configPath = join(workspace, "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error)
    throw new ProjectScannerError(
      "UI_CONTEXT_CONFIG_INVALID",
      "tsconfig.json is invalid",
    );
  return ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    workspace,
    undefined,
    configPath,
  ).options;
}

function assertLexicalPath(path: string): void {
  if (
    isAbsolute(path) ||
    /^[A-Za-z]:[\\/]/.test(path) ||
    path.split(/[\\/]/).includes("..")
  ) {
    throw new ProjectScannerError(
      "CONFIG_PATH_OUTSIDE_WORKSPACE",
      "Configured path must stay inside the workspace",
    );
  }
}

function assertContained(workspace: string, target: string): void {
  const rel = relative(workspace, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new ProjectScannerError(
      "CONFIG_PATH_OUTSIDE_WORKSPACE",
      "Configured path escapes the workspace",
    );
  }
}

async function assertOrdinaryPath(
  workspace: string,
  path: string,
  expected: "file" | "directory",
): Promise<void> {
  let current = workspace;
  for (const part of path.split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch {
      throw new ProjectScannerError(
        "PUBLIC_FACADE_NOT_FOUND",
        `Configured ${expected} does not exist`,
      );
    }
    if (info.isSymbolicLink()) {
      throw new ProjectScannerError(
        "CONFIG_SYMLINK_ESCAPES_WORKSPACE",
        "Configured public root contains a symbolic link",
      );
    }
  }
  const info = await lstat(current);
  if (
    (expected === "file" && !info.isFile()) ||
    (expected === "directory" && !info.isDirectory())
  ) {
    throw new ProjectScannerError(
      "PUBLIC_FACADE_NOT_FOUND",
      `Configured ${expected} is not ordinary`,
    );
  }
}

async function canonicalModulePath(path: string): Promise<string> {
  const candidates = [
    path,
    path.replace(/\.d\.ts$/, ".ts"),
    path.replace(/\.js$/, ".ts"),
    path.replace(/\.jsx$/, ".tsx"),
  ];
  for (const candidate of candidates) {
    try {
      return await realpath(candidate);
    } catch {
      /* try next TypeScript representation */
    }
  }
  return path;
}
