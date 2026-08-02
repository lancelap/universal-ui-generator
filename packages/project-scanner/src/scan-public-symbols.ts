import { realpath } from "node:fs/promises";
import { relative, sep } from "node:path";

import type {
  NormalizedPropType,
  ProjectScanDiagnostic,
  PublicComponentsV1,
  UiContextConfigV1,
  VerifiedProjectComponent,
  VerifiedProjectIcon,
} from "@uig/contracts";
import { assertPublicComponentsV1Integrity } from "@uig/contracts";
import ts from "typescript";

import { normalizeType } from "./normalize-prop-type.js";
import {
  type SemanticVocabulary,
  suggestProjectSemantics,
} from "./suggest-semantics.js";
import type { ResolvedPublicRoot } from "./types.js";

export async function scanPublicProject(input: {
  workspaceDir: string;
  config: UiContextConfigV1;
  resolvedRoots: readonly ResolvedPublicRoot[];
  semanticVocabulary?: SemanticVocabulary;
}): Promise<PublicComponentsV1> {
  const workspaceDir = await realpath(input.workspaceDir);
  const configPath = ts.findConfigFile(
    workspaceDir,
    ts.sys.fileExists,
    "tsconfig.json",
  );
  if (!configPath) throw new Error("tsconfig.json is required");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    workspaceDir,
    undefined,
    configPath,
  );
  const program = ts.createProgram(
    [
      ...new Set([
        ...parsed.fileNames,
        ...input.resolvedRoots.map((root) => root.absoluteEntryPath),
      ]),
    ],
    parsed.options,
  );
  const checker = program.getTypeChecker();
  const components: VerifiedProjectComponent[] = [];
  const icons: VerifiedProjectIcon[] = [];
  const diagnostics: ProjectScanDiagnostic[] = [];

  for (const root of [...input.resolvedRoots].sort((a, b) =>
    a.importSource.localeCompare(b.importSource),
  )) {
    const sourceFile = program.getSourceFile(root.absoluteEntryPath);
    const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
    if (!sourceFile || !moduleSymbol) continue;
    for (const exported of checker
      .getExportsOfModule(moduleSymbol)
      .sort((a, b) => compareExportNames(a.getName(), b.getName()))) {
      const exportName = exported.getName();
      const target =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported;
      const declaration = target.valueDeclaration ?? target.declarations?.[0];
      if (!declaration) continue;
      const symbolType = checker.getTypeOfSymbolAtLocation(target, declaration);
      const signature = symbolType.getCallSignatures()[0];
      if (
        !signature ||
        !isReactReturn(
          checker.typeToString(signature.getReturnType(), declaration),
        )
      )
        continue;
      const importIdentity = {
        source: root.importSource,
        export: exportName,
        style:
          exportName === "default" ? ("default" as const) : ("named" as const),
      };
      const id = `project:${root.importSource}#${exportName}`;
      const path = relative(workspaceDir, declaration.getSourceFile().fileName)
        .split(sep)
        .join("/");
      const evidence = [
        {
          kind: "public-export" as const,
          path: root.entry,
          export: exportName,
        },
      ];
      if (root.kind === "icon") {
        icons.push({
          id,
          kind: "icon",
          framework: "react",
          availability: "verified",
          import: importIdentity,
          aliases: [],
          evidence,
        });
        continue;
      }
      const propsParameter = signature.parameters[0];
      const propsType = propsParameter
        ? checker.getTypeOfSymbolAtLocation(propsParameter, declaration)
        : checker.getTypeAtLocation(declaration);
      const props = propsParameter
        ? propsType
            .getProperties()
            .sort((a, b) => a.getName().localeCompare(b.getName()))
            .map((property) => {
              const propertyDeclaration =
                property.valueDeclaration ??
                property.declarations?.[0] ??
                declaration;
              const tags = property.getJsDocTags(checker);
              const normalizedType = normalizeType({
                checker,
                type: checker.getTypeOfSymbolAtLocation(
                  property,
                  propertyDeclaration,
                ),
                location: propertyDeclaration,
              });
              if (containsOpaque(normalizedType)) {
                diagnostics.push({
                  code: "COMPONENT_PROP_TYPE_OPAQUE",
                  severity: "warning",
                  message: `Prop ${property.getName()} has an opaque public contract`,
                  componentId: id,
                  path,
                });
              }
              return {
                name: property.getName(),
                required: !(property.flags & ts.SymbolFlags.Optional),
                type: normalizedType,
                deprecated: tags.some((tag) => tag.name === "deprecated"),
              };
            })
        : [];
      const verifiedComponent: VerifiedProjectComponent = {
        id,
        kind: "react-component",
        framework: "react",
        availability: "verified",
        import: importIdentity,
        contract: {
          propsType: checker.typeToString(propsType, declaration),
          acceptsChildren: props.some((prop) => prop.name === "children"),
          props,
        },
        semantics: [],
        capabilities: [],
        formAdapters: [],
        evidence: [
          ...evidence,
          {
            kind: "typescript-contract",
            path,
            symbol: checker.typeToString(propsType, declaration),
          },
        ],
      };
      if (input.semanticVocabulary) {
        const suggestions = suggestProjectSemantics({
          component: verifiedComponent,
          vocabulary: input.semanticVocabulary,
        });
        verifiedComponent.semantics = suggestions.semanticRoles;
        verifiedComponent.capabilities = suggestions.capabilities;
        verifiedComponent.formAdapters = suggestions.formAdapters;
        diagnostics.push(...suggestions.diagnostics);
      }
      components.push(verifiedComponent);
    }
  }
  const result: PublicComponentsV1 = {
    schema: "public-components/v1",
    components: components.sort((a, b) =>
      compareExportNames(a.import.export, b.import.export),
    ),
    icons: icons.sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: diagnostics.sort((a, b) =>
      `${a.severity}:${a.code}:${a.path ?? ""}:${a.componentId ?? ""}`.localeCompare(
        `${b.severity}:${b.code}:${b.path ?? ""}:${b.componentId ?? ""}`,
      ),
    ),
  };
  assertPublicComponentsV1Integrity(result);
  return result;
}

function containsOpaque(type: NormalizedPropType): boolean {
  switch (type.kind) {
    case "opaque":
      return true;
    case "array":
      return containsOpaque(type.element);
    case "tuple":
      return type.elements.some(containsOpaque);
    case "object":
      return type.properties.some((property) => containsOpaque(property.type));
    case "function":
      return (
        type.parameters.some((parameter) => containsOpaque(parameter.type)) ||
        containsOpaque(type.returns)
      );
    default:
      return false;
  }
}

function compareExportNames(left: string, right: string): number {
  if (left === "default") return right === "default" ? 0 : 1;
  if (right === "default") return -1;
  return left.localeCompare(right);
}

function isReactReturn(displayName: string): boolean {
  return (
    displayName === "Element" ||
    displayName === "JSX.Element" ||
    displayName === "ReactElement" ||
    displayName.startsWith("ReactElement<")
  );
}
