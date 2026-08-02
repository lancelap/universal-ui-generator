import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

import {
  InstalledPackagesV1Schema,
  type InstalledPackagesV1,
  validateWithSchema,
} from "@uig/contracts";
import ts from "typescript";

export async function scanInstalledPackages(input: {
  workspaceDir: string;
  packageJsonPath: string;
  lockfilePath: string;
}): Promise<InstalledPackagesV1> {
  const workspace = await realpath(input.workspaceDir);
  const packageJson = JSON.parse(
    await readFile(input.packageJsonPath, "utf8"),
  ) as Record<string, unknown>;
  const dependencies = {
    ...record(packageJson.dependencies),
    ...record(packageJson.devDependencies),
    ...record(packageJson.peerDependencies),
  };
  const packages: InstalledPackagesV1["packages"] = [];
  const diagnostics: InstalledPackagesV1["diagnostics"] = [];

  for (const name of Object.keys(dependencies).sort()) {
    const manifestPath = join(workspace, "node_modules", name, "package.json");
    let canonicalManifest: string;
    try {
      await lstat(manifestPath);
      canonicalManifest = await realpath(manifestPath);
    } catch {
      diagnostics.push({
        severity: "error",
        code: "INSTALLED_PACKAGE_NOT_FOUND",
        message: `Declared package ${name} is not installed`,
        path: "package.json",
      });
      continue;
    }
    assertContained(workspace, canonicalManifest);
    const manifest = JSON.parse(
      await readFile(canonicalManifest, "utf8"),
    ) as Record<string, unknown>;
    const entries = collectPublicTypeEntries(manifest);
    const verifiedTypeEntries: InstalledPackagesV1["packages"][number]["publicTypeEntries"] =
      [];
    for (const entry of entries) {
      const typePath = join(dirname(canonicalManifest), entry.path);
      const canonicalTypePath = await realpath(typePath);
      assertContained(workspace, canonicalTypePath);
      const bytes = await readFile(canonicalTypePath);
      verifiedTypeEntries.push({
        subpath: entry.subpath,
        path: relativePath(workspace, canonicalTypePath),
        sha256: sha256(bytes),
        exports: extractPublicExports(
          canonicalTypePath,
          bytes.toString("utf8"),
        ),
      });
    }
    packages.push({
      name,
      version:
        typeof manifest.version === "string" ? manifest.version : "unknown",
      packageJsonPath: relativePath(workspace, canonicalManifest),
      publicTypeEntries: verifiedTypeEntries.sort((a, b) =>
        a.subpath.localeCompare(b.subpath),
      ),
    });
  }

  const lockfileBytes = await readFile(input.lockfilePath);
  return validateWithSchema(InstalledPackagesV1Schema, {
    schema: "installed-packages/v1",
    lockfile: {
      path: relativePath(workspace, await realpath(input.lockfilePath)),
      sha256: sha256(lockfileBytes),
    },
    packages,
    diagnostics: diagnostics.sort((a, b) => a.code.localeCompare(b.code)),
  });
}

function collectPublicTypeEntries(
  manifest: Record<string, unknown>,
): Array<{ subpath: string; path: string }> {
  const output: Array<{ subpath: string; path: string }> = [];
  const exportsField = manifest.exports;
  if (typeof exportsField === "string" && exportsField.endsWith(".d.ts")) {
    output.push({ subpath: ".", path: exportsField });
  } else if (exportsField && typeof exportsField === "object") {
    const exportsRecord = exportsField as Record<string, unknown>;
    if (typeof exportsRecord.types === "string") {
      output.push({ subpath: ".", path: exportsRecord.types });
    }
    for (const [subpath, value] of Object.entries(exportsRecord)) {
      if (!subpath.startsWith(".")) continue;
      if (typeof value === "string" && value.endsWith(".d.ts")) {
        output.push({ subpath, path: value });
      } else if (
        value &&
        typeof value === "object" &&
        typeof (value as Record<string, unknown>).types === "string"
      ) {
        const typesPath = (value as Record<string, unknown>).types;
        output.push({
          subpath,
          path: typesPath as string,
        });
      }
    }
  }
  if (output.length === 0) {
    const types = manifest.types ?? manifest.typings;
    if (typeof types === "string") output.push({ subpath: ".", path: types });
  }
  return output.sort((a, b) => a.subpath.localeCompare(b.subpath));
}

function extractPublicExports(path: string, source: string): string[] {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = new Set<string>();
  for (const statement of file.statements) {
    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    const exported = modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (
      exported &&
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
    if (exported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          names.add(element.name.text);
        }
      }
    }
    if (
      modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      )
    ) {
      names.add("default");
    }
  }
  return [...names].sort();
}

function assertContained(workspace: string, path: string): void {
  const rel = relative(workspace, path);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Installed package resolves outside the workspace");
  }
}

function relativePath(workspace: string, path: string): string {
  return relative(workspace, path).split(sep).join("/");
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
