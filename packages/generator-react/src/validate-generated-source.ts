import ts from "typescript";

import { ReactGenerationError } from "./errors.js";

export interface GeneratedTsxExpectation {
  componentName: string;
  exportedDeclarations: GeneratedExportedDeclarationExpectation[];
  externalImports: GeneratedExternalImportExpectation[];
  cssModuleImport?: GeneratedCssModuleImportExpectation;
  generatedRelativeImports: GeneratedRelativeImportExpectation[];
  jsxNames: string[];
  localComponentNames: string[];
}

export interface GeneratedExportedDeclarationExpectation {
  kind: "function" | "interface";
  name: string;
}

export interface GeneratedExternalImportExpectation {
  source: string;
  specifiers: GeneratedImportSpecifierExpectation[];
  typeOnly: boolean;
}

export interface GeneratedImportSpecifierExpectation {
  kind: "default" | "named";
  imported: string;
  local: string;
}

export interface GeneratedCssModuleImportExpectation {
  source: string;
  localName: string;
}

export interface GeneratedRelativeImportExpectation {
  source: string;
  specifiers: GeneratedImportSpecifierExpectation[];
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
  validateExportedDeclarations(file, expectation.exportedDeclarations);

  const expectedExternalSources = new Set(
    expectation.externalImports.map((item) => item.source),
  );
  const expectedGeneratedSources = new Set(
    expectation.generatedRelativeImports.map((item) => item.source),
  );
  const expectedJsxNames = new Set(expectation.jsxNames);
  const expectedLocalComponentNames = new Set(expectation.localComponentNames);
  const externalImports: GeneratedExternalImportExpectation[] = [];
  const generatedRelativeImports: GeneratedRelativeImportExpectation[] = [];
  const jsxNames = new Set<string>();
  const localComponentNames = new Set<string>();
  let cssModuleImport: GeneratedCssModuleImportExpectation | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const packageName = ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : undefined;
      if (!packageName) {
        invalid("Import module specifier must be a string literal");
      }
      const localNames = importedLocalNames(node.importClause).sort();
      const specifiers = importedSpecifiers(node.importClause);
      if (packageName === expectation.cssModuleImport?.source) {
        if (
          localNames.length !== 1 ||
          localNames[0] !== expectation.cssModuleImport.localName ||
          node.importClause?.name?.text !==
            expectation.cssModuleImport.localName ||
          node.importClause.namedBindings
        ) {
          invalid("CSS Module import does not match expectation");
        }
        cssModuleImport = {
          source: packageName,
          localName: expectation.cssModuleImport.localName,
        };
      } else if (expectedGeneratedSources.has(packageName)) {
        if (node.importClause?.isTypeOnly) {
          invalid(
            `Generated relative import ${packageName} cannot be type-only`,
          );
        }
        generatedRelativeImports.push({
          source: packageName,
          specifiers,
        });
      } else if (expectedExternalSources.has(packageName)) {
        externalImports.push({
          source: packageName,
          specifiers,
          typeOnly: node.importClause?.isTypeOnly ?? false,
        });
      } else {
        invalid(`Unexpected import source ${JSON.stringify(packageName)}`);
      }
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

  if (
    JSON.stringify(sortExternalImports(externalImports)) !==
    JSON.stringify(sortExternalImports(expectation.externalImports))
  ) {
    invalid(
      `External imports do not match expectation: received ${JSON.stringify(
        sortExternalImports(externalImports),
      )}`,
    );
  }
  if (
    JSON.stringify(sortGeneratedImports(generatedRelativeImports)) !==
    JSON.stringify(sortGeneratedImports(expectation.generatedRelativeImports))
  ) {
    invalid(
      `Generated relative imports do not match expectation: received ${JSON.stringify(
        sortGeneratedImports(generatedRelativeImports),
      )}`,
    );
  }
  if (
    JSON.stringify(cssModuleImport) !==
    JSON.stringify(expectation.cssModuleImport)
  ) {
    invalid(
      `CSS Module import does not match expectation: received ${JSON.stringify(
        cssModuleImport,
      )}`,
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

function validateExportedDeclarations(
  file: ts.SourceFile,
  expected: GeneratedExportedDeclarationExpectation[],
): void {
  const topLevelDeclarations = file.statements.flatMap(declarationRecords);
  const allDeclarations: DeclarationRecord[] = [];
  const collect = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isVariableStatement(node)
    ) {
      allDeclarations.push(...declarationRecords(node));
    }
    ts.forEachChild(node, collect);
  };
  collect(file);
  for (const declaration of expected) {
    const matches = allDeclarations.filter(
      (candidate) => candidate.name === declaration.name,
    );
    if (
      matches.length !== 1 ||
      matches[0]!.kind !== declaration.kind ||
      !matches[0]!.exported ||
      matches[0]!.defaultExport
    ) {
      invalid(
        `Expected exactly one named exported ${declaration.kind} ${declaration.name}`,
      );
    }
  }
  const actualExports = topLevelDeclarations
    .filter((declaration) => declaration.exported)
    .map(({ kind, name }) => ({ kind, name }))
    .sort(compareDeclarations);
  const expectedExports = [...expected].sort(compareDeclarations);
  if (JSON.stringify(actualExports) !== JSON.stringify(expectedExports)) {
    invalid(
      `Exported declarations do not match expectation: received ${JSON.stringify(actualExports)}`,
    );
  }
}

interface DeclarationRecord {
  kind: "function" | "interface" | "other";
  name: string;
  exported: boolean;
  defaultExport: boolean;
}

function declarationRecords(statement: ts.Statement): DeclarationRecord[] {
  if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
    invalid("Generated TSX contains an unsupported export declaration");
  }
  const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
  const defaultExport = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    return [
      {
        kind: "function",
        name: statement.name.text,
        exported,
        defaultExport,
      },
    ];
  }
  if (ts.isInterfaceDeclaration(statement)) {
    return [
      {
        kind: "interface",
        name: statement.name.text,
        exported,
        defaultExport,
      },
    ];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name)
        ? [
            {
              kind: "other" as const,
              name: declaration.name.text,
              exported,
              defaultExport,
            },
          ]
        : [],
    );
  }
  const named = statement as ts.Statement & {
    name?: ts.Identifier;
  };
  if (named.name && ts.isIdentifier(named.name)) {
    return [
      {
        kind: "other",
        name: named.name.text,
        exported,
        defaultExport,
      },
    ];
  }
  if (exported) {
    invalid("Generated TSX contains an unsupported export declaration");
  }
  return [];
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ??
        false)
    : false;
}

function compareDeclarations(
  left: { kind: string; name: string },
  right: { kind: string; name: string },
): number {
  return (
    left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name)
  );
}

function sortExternalImports(
  imports: GeneratedExternalImportExpectation[],
): GeneratedExternalImportExpectation[] {
  return imports
    .map((item) => ({
      ...item,
      specifiers: sortImportSpecifiers(item.specifiers),
    }))
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        JSON.stringify(left.specifiers).localeCompare(
          JSON.stringify(right.specifiers),
        ) ||
        Number(left.typeOnly) - Number(right.typeOnly),
    );
}

function sortGeneratedImports(
  imports: GeneratedRelativeImportExpectation[],
): GeneratedRelativeImportExpectation[] {
  return imports
    .map((item) => ({
      ...item,
      specifiers: sortImportSpecifiers(item.specifiers),
    }))
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        JSON.stringify(left.specifiers).localeCompare(
          JSON.stringify(right.specifiers),
        ),
    );
}

function sortImportSpecifiers(
  specifiers: GeneratedImportSpecifierExpectation[],
): GeneratedImportSpecifierExpectation[] {
  return [...specifiers].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.imported.localeCompare(right.imported) ||
      left.local.localeCompare(right.local),
  );
}

function importedSpecifiers(
  importClause: ts.ImportClause | undefined,
): GeneratedImportSpecifierExpectation[] {
  if (!importClause) {
    return [];
  }
  const specifiers: GeneratedImportSpecifierExpectation[] = importClause.name
    ? [
        {
          kind: "default",
          imported: "default",
          local: importClause.name.text,
        },
      ]
    : [];
  const bindings = importClause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) {
    invalid("Namespace imports are not supported in generated TSX");
  }
  if (bindings && ts.isNamedImports(bindings)) {
    specifiers.push(
      ...bindings.elements.map((element) => ({
        kind: "named" as const,
        imported: element.propertyName?.text ?? element.name.text,
        local: element.name.text,
      })),
    );
  }
  return sortImportSpecifiers(specifiers);
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
