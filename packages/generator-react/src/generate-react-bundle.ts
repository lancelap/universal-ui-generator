import { TextEncoder } from "node:util";
import { isAbsolute } from "node:path";

import {
  type Diagnostic,
  type GeneratedSourceFile,
  type ReactGenerationBundleV2,
  type ReactGenerationReportV2,
  ReactGenerationReportV2Schema,
  assertReactGenerationReportIntegrity,
  stableStringify,
  validateWithSchema,
} from "@uig/contracts";
import { sha256 } from "@uig/design-context";

import { buildReactGenerationModel } from "./build-react-generation-model.js";
import { emitCssModule } from "./emit-css-module.js";
import { emitFallbackTsx, emitTsx } from "./emit-tsx.js";
import { ReactGenerationError } from "./errors.js";
import type {
  ReactElementModel,
  ReactGeneratedRelativeImportModel,
  ReactGenerationInput,
  ReactGenerationModel,
} from "./generation-model.js";
import { validateGenerationInput } from "./validate-generation-input.js";
import { validateGeneratedTsx } from "./validate-generated-source.js";

const componentName = "GeneratedModal";
const encoder = new TextEncoder();

/** Compiles validated v2 planning artifacts into a deterministic React bundle. */
export function generateReactBundle(
  input: ReactGenerationInput,
): ReactGenerationBundleV2 {
  const validated = validateGenerationInput(input);
  if (validated.status === "blocked") {
    const report = reportForBlocked(input, validated.diagnostics);
    const bundle: ReactGenerationBundleV2 = {
      schema: "react-generation-bundle/v2",
      status: "blocked",
      sourceRunId: input.sourceRunId,
      files: [],
      report,
    };
    assertReactGenerationBundleIntegrity(bundle);
    return bundle;
  }

  const model = reserveFallbackComponentNames(
    buildReactGenerationModel(validated),
    componentName,
  );
  const generatedRelativeImports = model.fallbacks.map(
    (fallback): ReactGeneratedRelativeImportModel => ({
      kind: "generated-relative",
      path: `./fallbacks/${fallback.localComponentName}`,
      specifiers: [
        {
          imported: fallback.localComponentName,
          local: fallback.localComponentName,
        },
      ],
    }),
  );
  const tsx = emitTsx(model, componentName, generatedRelativeImports);
  validateGeneratedTsx(tsx, {
    componentName,
    exportedDeclarations: [
      { kind: "interface", name: `${componentName}Props` },
      { kind: "function", name: componentName },
    ],
    externalImports: externalImportExpectations(model),
    ...(rootUsesStyles(model.root)
      ? {
          cssModuleImport: {
            source: `./${componentName}.module.css`,
            localName: "styles",
          },
        }
      : {}),
    generatedRelativeImports: generatedRelativeImports.map((item) => ({
      source: item.path,
      specifiers: item.specifiers.map((specifier) => ({
        kind: "named",
        imported: specifier.imported,
        local: specifier.local,
      })),
    })),
    jsxNames: jsxNames(model.root),
    localComponentNames: [],
  });

  const fallbackClassNames = new Set(
    model.fallbacks.map((fallback) => fallback.className),
  );
  const files: GeneratedSourceFile[] = [
    sourceFile(
      `${componentName}.module.css`,
      "css-module",
      emitCssModule(
        model.styles.filter(
          (style) => !fallbackClassNames.has(style.className),
        ),
      ),
    ),
    sourceFile(`${componentName}.tsx`, "tsx", tsx),
  ];
  for (const fallback of model.fallbacks) {
    const fallbackTsx = emitFallbackTsx(fallback);
    validateGeneratedTsx(fallbackTsx, {
      componentName: fallback.localComponentName,
      exportedDeclarations: [
        {
          kind: "interface",
          name: `${fallback.localComponentName}Props`,
        },
        { kind: "function", name: fallback.localComponentName },
      ],
      externalImports: [
        {
          source: "react",
          specifiers: [
            {
              kind: "named",
              imported: "ReactNode",
              local: "ReactNode",
            },
          ],
          typeOnly: true,
        },
      ],
      cssModuleImport: {
        source: `./${fallback.localComponentName}.module.css`,
        localName: "styles",
      },
      generatedRelativeImports: [],
      jsxNames: [],
      localComponentNames: [],
    });
    const fallbackStyles = model.styles.filter(
      (style) => style.className === fallback.className,
    );
    files.push(
      sourceFile(
        `fallbacks/${fallback.localComponentName}.module.css`,
        "fallback-css-module",
        emitCssModule(fallbackStyles),
      ),
      sourceFile(
        `fallbacks/${fallback.localComponentName}.tsx`,
        "fallback-tsx",
        fallbackTsx,
      ),
    );
  }
  const report = reportForGenerated(input, model, files);
  const bundle: ReactGenerationBundleV2 = {
    schema: "react-generation-bundle/v2",
    status: "generated",
    sourceRunId: input.sourceRunId,
    files,
    report,
  };
  assertReactGenerationBundleIntegrity(bundle);
  return bundle;
}

export function assertReactGenerationBundleIntegrity(
  bundle: ReactGenerationBundleV2,
): void {
  if (bundle.schema !== "react-generation-bundle/v2") {
    invalidBundle(
      `Unexpected React generation bundle schema: ${bundle.schema}`,
    );
  }
  validateWithSchema(ReactGenerationReportV2Schema, bundle.report);
  assertReactGenerationReportIntegrity(bundle.report);
  if (
    bundle.status !== bundle.report.status ||
    bundle.sourceRunId !== bundle.report.sourceRunId
  ) {
    invalidBundle("Bundle status or source run does not match its report");
  }

  const actual = new Map<string, GeneratedSourceFile>();
  for (const file of bundle.files) {
    assertSafeUniquePath(file.path, actual);
    if (
      file.byteLength !== file.bytes.byteLength ||
      file.sha256 !== sha256(file.bytes)
    ) {
      invalidBundle(`Generated file bytes do not match metadata: ${file.path}`);
    }
    actual.set(file.path, file);
  }

  const reported = new Map<string, ReactGenerationReportV2["files"][number]>();
  for (const file of bundle.report.files) {
    assertSafeUniquePath(file.path, reported);
    reported.set(file.path, file);
  }
  if (
    actual.size !== reported.size ||
    [...actual].some(([path, file]) => {
      const reportFile = reported.get(path);
      return (
        !reportFile ||
        reportFile.kind !== file.kind ||
        reportFile.sha256 !== file.sha256 ||
        reportFile.byteLength !== file.byteLength
      );
    })
  ) {
    invalidBundle("Bundle files do not exactly match report files");
  }
}

function reportForBlocked(
  input: ReactGenerationInput,
  diagnostics: Diagnostic[],
): ReactGenerationReportV2 {
  return validateReport({
    schema: "react-generation-report/v2",
    status: "blocked",
    sourceRunId: input.sourceRunId,
    designSystem: input.pack.manifest.id,
    statistics: emptyStatistics(
      validatedManifestNodeCount(input.uiManifest.root),
    ),
    renderOnlyProps: [],
    validation: {
      inputContracts: "passed",
      pack: "passed",
      syntax: "not-run",
      targetTypecheck: "not-run",
    },
    files: [],
    diagnostics: sortDiagnostics(diagnostics),
  });
}

function reportForGenerated(
  input: ReactGenerationInput,
  model: ReactGenerationModel,
  files: GeneratedSourceFile[],
): ReactGenerationReportV2 {
  const fileReports = files.map((file) => ({
    path: file.path,
    kind: file.kind,
    sha256: file.sha256,
    byteLength: file.byteLength,
  }));
  const report = validateReport({
    schema: "react-generation-report/v2",
    status: "generated",
    componentName,
    sourceRunId: input.sourceRunId,
    designSystem: input.pack.manifest.id,
    statistics: {
      manifestNodes: validatedManifestNodeCount(input.uiManifest.root),
      imports: importedComponentBindingCount(model),
      generatedProps: model.externalProps.length,
      cssRules: model.styles.length,
      fallbackComponents: model.fallbacks.length,
      filesByKind: {
        tsx: files.filter((file) => file.kind === "tsx").length,
        cssModule: files.filter((file) => file.kind === "css-module").length,
        fallbackTsx: files.filter((file) => file.kind === "fallback-tsx")
          .length,
        fallbackCssModule: files.filter(
          (file) => file.kind === "fallback-css-module",
        ).length,
      },
      sourceByteLength: files.reduce(
        (total, file) => total + file.byteLength,
        0,
      ),
    },
    renderOnlyProps: [...model.renderOnlyProps].sort(
      (left, right) =>
        left.manifestNodeId.localeCompare(right.manifestNodeId) ||
        left.componentId.localeCompare(right.componentId) ||
        stableStringify(left.propNames).localeCompare(
          stableStringify(right.propNames),
        ),
    ),
    validation: {
      inputContracts: "passed",
      pack: "passed",
      syntax: "passed",
      targetTypecheck: "not-run",
    },
    files: fileReports,
    diagnostics: sortDiagnostics([
      ...input.resolutionPlan.diagnostics.filter(
        (diagnostic) => !diagnostic.blocking,
      ),
      ...model.diagnostics,
    ]),
  });
  assertGeneratedStatistics(
    report,
    model,
    validatedManifestNodeCount(input.uiManifest.root),
  );
  return report;
}

function sourceFile(
  path: string,
  kind: GeneratedSourceFile["kind"],
  source: string,
): GeneratedSourceFile {
  const bytes = encoder.encode(source);
  return {
    path,
    kind,
    bytes,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
  };
}

function jsxNames(root: ReactElementModel): string[] {
  const names = new Set<string>();
  const visit = (element: ReactElementModel): void => {
    if (element.kind !== "intrinsic-wrapper") {
      names.add(
        element.kind === "fallback"
          ? element.localComponentName
          : element.localName,
      );
    }
    if (element.kind === "compose") {
      for (const slot of element.slots) {
        names.add(slot.localName);
        slot.children.forEach(visit);
      }
    }
    element.children.forEach(visit);
  };
  visit(root);
  return [...names].sort();
}

function rootUsesStyles(root: ReactElementModel): boolean {
  const props =
    root.kind === "reuse" || root.kind === "compose" ? root.props : [];
  return (
    root.kind === "intrinsic-wrapper" ||
    props.some((prop) => prop.value.kind === "class-name") ||
    (root.kind === "compose" &&
      root.slots.some((slot) => slot.children.some(rootUsesStyles))) ||
    root.children.some(rootUsesStyles)
  );
}

function externalImportExpectations(model: ReactGenerationModel) {
  return model.imports.map((item) => ({
    source: item.package,
    specifiers:
      item.kind === "default"
        ? [
            {
              kind: "default" as const,
              imported: "default",
              local: item.local,
            },
          ]
        : item.specifiers.map((specifier) => ({
            kind: "named" as const,
            imported: specifier.imported,
            local: specifier.local,
          })),
    typeOnly: false,
  }));
}

function importedComponentBindingCount(model: ReactGenerationModel): number {
  return (
    model.imports.reduce(
      (count, item) =>
        count + (item.kind === "default" ? 1 : item.specifiers.length),
      0,
    ) + model.fallbacks.length
  );
}

function assertGeneratedStatistics(
  report: ReactGenerationReportV2,
  model: ReactGenerationModel,
  manifestNodes: number,
): void {
  const expected = {
    manifestNodes,
    imports: importedComponentBindingCount(model),
    generatedProps: model.externalProps.length,
    cssRules: model.styles.length,
    fallbackComponents: model.fallbacks.length,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (report.statistics[name as keyof typeof expected] !== value) {
      invalidBundle(
        `Generation statistic ${name} does not match construction: expected ${value}`,
      );
    }
  }
}

function reserveFallbackComponentNames(
  model: ReactGenerationModel,
  rootComponentName: string,
): ReactGenerationModel {
  const reserved = new Set<string>([
    rootComponentName,
    `${rootComponentName}Props`,
    ...(rootUsesStyles(model.root) ? ["styles"] : []),
    ...model.imports.flatMap((item) =>
      item.kind === "default"
        ? [item.local]
        : item.specifiers.map((specifier) => specifier.local),
    ),
  ]);
  const fallbacksByBaseName = new Map<
    string,
    ReactGenerationModel["fallbacks"]
  >();
  for (const fallback of model.fallbacks) {
    const group = fallbacksByBaseName.get(fallback.localComponentName) ?? [];
    group.push(fallback);
    fallbacksByBaseName.set(fallback.localComponentName, group);
  }

  const namesByNodeId = new Map<string, string>();
  for (const baseName of [...fallbacksByBaseName.keys()].sort()) {
    const group = [...fallbacksByBaseName.get(baseName)!].sort((left, right) =>
      left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0,
    );
    const requiresAlias = group.length > 1 || reserved.has(baseName);
    for (const fallback of group) {
      const name = requiresAlias
        ? reserveHashedName(baseName, fallback.nodeId, reserved)
        : baseName;
      reserved.add(name);
      namesByNodeId.set(fallback.nodeId, name);
    }
  }

  const visited = new WeakSet<object>();
  const renameElement = (element: ReactElementModel): void => {
    if (visited.has(element)) {
      return;
    }
    visited.add(element);
    if (element.kind === "fallback") {
      element.localComponentName = namesByNodeId.get(element.nodeId)!;
    }
    if (element.kind === "compose") {
      for (const slot of element.slots) {
        slot.children.forEach(renameElement);
      }
    }
    element.children.forEach(renameElement);
  };
  renameElement(model.root);

  return {
    ...model,
    fallbacks: model.fallbacks.map((fallback) => ({
      ...fallback,
      localComponentName: namesByNodeId.get(fallback.nodeId)!,
    })),
  };
}

function reserveHashedName(
  baseName: string,
  manifestNodeId: string,
  reserved: ReadonlySet<string>,
): string {
  const hash = sha256(manifestNodeId);
  for (let length = 8; length <= hash.length; length += 4) {
    const candidate = `${baseName}_${hash.slice(0, length)}`;
    if (!reserved.has(candidate)) {
      return candidate;
    }
  }
  for (let counter = 2; ; counter += 1) {
    const candidate = `${baseName}_${hash}_${counter}`;
    if (!reserved.has(candidate)) {
      return candidate;
    }
  }
}

function validatedManifestNodeCount(
  root: ReactGenerationInput["uiManifest"]["root"],
): number {
  return (
    1 +
    root.children.reduce(
      (count, child) => count + validatedManifestNodeCount(child),
      0,
    )
  );
}

function emptyStatistics(manifestNodes: number) {
  return {
    manifestNodes,
    imports: 0,
    generatedProps: 0,
    cssRules: 0,
    fallbackComponents: 0,
    filesByKind: { tsx: 0, cssModule: 0, fallbackTsx: 0, fallbackCssModule: 0 },
    sourceByteLength: 0,
  };
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      left.stage.localeCompare(right.stage) ||
      left.code.localeCompare(right.code) ||
      stableStringify(left.evidence ?? {}).localeCompare(
        stableStringify(right.evidence ?? {}),
      ),
  );
}

function validateReport(
  report: ReactGenerationReportV2,
): ReactGenerationReportV2 {
  const validated = validateWithSchema(ReactGenerationReportV2Schema, report);
  assertReactGenerationReportIntegrity(validated);
  return validated;
}

function assertSafeUniquePath(
  path: string,
  existing: ReadonlyMap<string, unknown>,
): void {
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path
      .split("/")
      .some(
        (segment) => segment === "" || segment === "." || segment === "..",
      ) ||
    existing.has(path)
  ) {
    invalidBundle(
      `Unsafe or duplicate generated path: ${JSON.stringify(path)}`,
    );
  }
}

function invalidBundle(message: string): never {
  throw new ReactGenerationError("GENERATION_SOURCE_INVALID", message);
}
