import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

import {
  stableStringify,
  validateWithSchema,
  UiContextConfigV1Schema,
} from "@uig/contracts";

import type { ProjectDiscovery } from "./types.js";
import { ProjectScannerError } from "./types.js";

const LOCKFILES = [
  { path: "pnpm-lock.yaml", manager: "pnpm" as const },
  { path: "package-lock.json", manager: "npm" as const },
  { path: "yarn.lock", manager: "yarn" as const },
] as const;

const PACK_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["@mui/", "mui"],
  ["@sber-space-ui/", "sber-space-ui"],
];

export async function discoverProject(input: {
  workspaceDir: string;
  availablePackIds: readonly string[];
  defaultPackId: "sber-space-ui";
}): Promise<ProjectDiscovery> {
  const packageJsonPath = join(input.workspaceDir, "package.json");
  const packageJson = await readJson(
    packageJsonPath,
    "UI_CONTEXT_CONFIG_INVALID",
  );
  const packageName =
    typeof packageJson.name === "string" ? packageJson.name : "unnamed-project";

  const foundLocks = [];
  for (const lock of LOCKFILES)
    if (await isFile(join(input.workspaceDir, lock.path)))
      foundLocks.push(lock);
  if (foundLocks.length > 1) {
    throw new ProjectScannerError(
      "MULTIPLE_LOCKFILES_FOUND",
      "Multiple supported lockfiles were found",
    );
  }
  if (foundLocks.length === 0) {
    if (
      (await isFile(join(input.workspaceDir, "bun.lock"))) ||
      (await isFile(join(input.workspaceDir, "bun.lockb")))
    ) {
      throw new ProjectScannerError(
        "PACKAGE_MANAGER_UNSUPPORTED",
        "Bun projects are not supported in v1",
      );
    }
    throw new ProjectScannerError(
      "UI_CONTEXT_CONFIG_INVALID",
      "A supported lockfile is required",
    );
  }
  const lock = foundLocks[0]!;
  const tsconfigPath = join(input.workspaceDir, "tsconfig.json");
  const tsconfig = await readJson(tsconfigPath, "UI_CONTEXT_CONFIG_INVALID");
  const aliases = parseAliases(tsconfig);
  const entries = await findFacadeEntries(join(input.workspaceDir, "src"));
  const roots = entries
    .map((entry) => facadeFromEntry(input.workspaceDir, entry, aliases))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.path.localeCompare(b.path));

  const dependencies = {
    ...objectRecord(packageJson.dependencies),
    ...objectRecord(packageJson.devDependencies),
    ...objectRecord(packageJson.peerDependencies),
  };
  const available = new Set(input.availablePackIds);
  const selected = new Set<string>();
  for (const dependency of Object.keys(dependencies).sort()) {
    for (const [prefix, pack] of PACK_PREFIXES) {
      if (dependency.startsWith(prefix) && available.has(pack))
        selected.add(pack);
    }
  }
  if (selected.size === 0) selected.add(input.defaultPackId);

  const componentRoots = roots.filter((entry) => !isIconPath(entry.path));
  const iconRoots = roots.filter((entry) => isIconPath(entry.path));
  const proposedConfig = validateWithSchema(UiContextConfigV1Schema, {
    schema: "ui-context-config/v1",
    framework: "react",
    language: "typescript",
    designSystemPacks: [...selected].sort(),
    componentRoots,
    iconRoots,
    workspacePackages: { discovery: "public-exports" },
    ignore: [
      "**/*.test.*",
      "**/*.spec.*",
      "**/*.stories.*",
      "**/__fixtures__/**",
      "**/__mocks__/**",
    ],
  });

  const evidencePaths = [
    "package.json",
    lock.path,
    "tsconfig.json",
    ...roots.map((entry) => entry.entry),
  ];
  const evidenceHashes = await Promise.all(
    evidencePaths.map(async (path) => ({
      path,
      sha256: createHash("sha256")
        .update(await readFile(join(input.workspaceDir, path)))
        .digest("hex"),
    })),
  );
  const discoveryId = createHash("sha256")
    .update(stableStringify({ proposedConfig, evidenceHashes }))
    .digest("hex");

  return {
    schema: "project-discovery/v1",
    discoveryId,
    packageManager: lock.manager,
    packageName,
    lockfilePath: lock.path,
    tsconfigPath: "tsconfig.json",
    proposedConfig,
    evidencePaths,
    diagnostics: [],
  };
}

async function readJson(
  path: string,
  code: "UI_CONTEXT_CONFIG_INVALID",
): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    throw new ProjectScannerError(
      code,
      `${basename(path)} is missing or invalid`,
    );
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function findFacadeEntries(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (
        entry.isFile() &&
        (entry.name === "index.ts" || entry.name === "index.tsx")
      )
        output.push(target);
    }
  }
  await visit(root);
  return output.sort();
}

function parseAliases(
  tsconfig: Record<string, unknown>,
): Array<{ pattern: string; target: string }> {
  const compilerOptions = objectRecord(tsconfig.compilerOptions);
  const paths = objectRecord(compilerOptions.paths);
  const output: Array<{ pattern: string; target: string }> = [];
  for (const [pattern, values] of Object.entries(paths)) {
    if (Array.isArray(values) && typeof values[0] === "string")
      output.push({ pattern, target: values[0] });
  }
  return output.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

function facadeFromEntry(
  workspace: string,
  entry: string,
  aliases: Array<{ pattern: string; target: string }>,
) {
  const rootPath = relative(workspace, dirname(entry)).split(sep).join("/");
  for (const alias of aliases) {
    const star = alias.target.indexOf("*");
    if (star < 0) continue;
    const targetPrefix = alias.target.slice(0, star).replace(/\/$/, "");
    if (rootPath !== targetPrefix && !rootPath.startsWith(`${targetPrefix}/`))
      continue;
    const suffix = rootPath.slice(targetPrefix.length).replace(/^\//, "");
    return {
      path: rootPath,
      entry: relative(workspace, entry).split(sep).join("/"),
      importSource: alias.pattern.replace("*", suffix),
    };
  }
  return null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isIconPath(path: string): boolean {
  return path.split("/").some((part) => part.toLowerCase() === "icons");
}
