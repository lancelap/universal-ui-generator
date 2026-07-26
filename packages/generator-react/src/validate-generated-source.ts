import ts from "typescript";

import { ReactGenerationError } from "./errors.js";

export interface GeneratedTsxExpectation {
  componentName: string;
  packages: string[];
  importedLocalNames: string[];
  jsxNames: string[];
  localComponentNames: string[];
}

export function validateGeneratedTsx(
  source: string,
  expectation: GeneratedTsxExpectation,
): void {
  const file = ts.createSourceFile(
    `${expectation.componentName}.tsx`,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const parseDiagnostics = (
    file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if (parseDiagnostics.length > 0) {
    invalid(
      `TSX parse failure: ${parseDiagnostics
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        )
        .join("; ")}`,
    );
  }

  const expectedPackages = new Set(expectation.packages);
  const expectedImportedNames = new Set(expectation.importedLocalNames);
  const expectedJsxNames = new Set(expectation.jsxNames);
  const expectedLocalComponentNames = new Set(expectation.localComponentNames);
  const importedPackages = new Set<string>();
  const importedNames = new Set<string>();
  const jsxNames = new Set<string>();
  const localComponentNames = new Set<string>();
  let componentFound = false;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const packageName = ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : undefined;
      if (packageName === `./${expectation.componentName}.module.css`) {
        if (node.importClause?.name?.text !== "styles") {
          invalid("CSS Module import must use the local name styles");
        }
      } else if (!packageName || !expectedPackages.has(packageName)) {
        invalid(`Unexpected import package ${JSON.stringify(packageName)}`);
      } else {
        importedPackages.add(packageName);
        for (const localName of importedLocalNames(node.importClause)) {
          importedNames.add(localName);
        }
      }
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === expectation.componentName
    ) {
      componentFound = true;
    }
    const localComponentName = declaredLocalComponentName(
      node,
      expectation.componentName,
    );
    if (localComponentName) {
      localComponentNames.add(localComponentName);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const identifier = jsxTagIdentifier(node.tagName);
      if (identifier) {
        jsxNames.add(identifier);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  if (!componentFound) {
    invalid(`Missing component function ${expectation.componentName}`);
  }
  if (!sameSet(importedPackages, expectedPackages)) {
    invalid(
      `Imported packages do not match expectation: received ${[...importedPackages].sort().join(", ")}`,
    );
  }
  if (!sameSet(importedNames, expectedImportedNames)) {
    invalid(
      `Imported local names do not match expectation: received ${[...importedNames].sort().join(", ")}`,
    );
  }
  if (!sameSet(jsxNames, expectedJsxNames)) {
    invalid(
      `JSX identifiers do not match expectation: received ${[...jsxNames].sort().join(", ")}`,
    );
  }
  if (!sameSet(localComponentNames, expectedLocalComponentNames)) {
    invalid(
      `Local component declarations do not match expectation: received ${[...localComponentNames].sort().join(", ")}`,
    );
  }
}

function importedLocalNames(
  importClause: ts.ImportClause | undefined,
): string[] {
  if (!importClause) {
    return [];
  }
  const names = importClause.name ? [importClause.name.text] : [];
  const bindings = importClause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    names.push(...bindings.elements.map((element) => element.name.text));
  }
  return names;
}

function jsxTagIdentifier(
  tagName: ts.JsxTagNameExpression,
): string | undefined {
  if (ts.isIdentifier(tagName)) {
    return /^[A-Z]/.test(tagName.text) ? tagName.text : undefined;
  }
  return undefined;
}

function declaredLocalComponentName(
  node: ts.Node,
  rootComponentName: string,
): string | undefined {
  const name =
    ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
      ? node.name?.text
      : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        ? node.name.text
        : undefined;
  return name && name !== rootComponentName && /^[A-Z]/.test(name)
    ? name
    : undefined;
}

function sameSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

function invalid(message: string): never {
  throw new ReactGenerationError("GENERATION_SOURCE_INVALID", message);
}
